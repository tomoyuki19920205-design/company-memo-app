import { SupabaseClient } from "@supabase/supabase-js";
import type { TdnetEvent, TdnetEventComment, EnrichedEvent } from "./types";

// ============================================================
// 一覧取得
// ============================================================
export async function fetchEvents(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    limit?: number;
    eventType?: string;
    search?: string;
    unreadOnly?: boolean;
    starredOnly?: boolean;
    discordOnly?: boolean;
    todayOnly?: boolean;
    selectedDate?: string | null; // YYYY-MM-DD (JST)
    showArchived?: boolean;
    /** true のときはクライアントサイドの is_read/priority_rank ソートをスキップ。
     *  DB取得順 (disclosed_at DESC NULLS LAST -> detected_at DESC) をそのまま維持する。
     *  「全件」タブ向け。 */
    skipClientSort?: boolean;
    allPeriodTickerSearch?: boolean;
  }
): Promise<EnrichedEvent[]> {
  const limit = opts.limit ?? 1000;
  // limit 調整: 全期間ONかつ検索入力がある場合は 100 に制限
  const isAllPeriodSearchActive = opts.allPeriodTickerSearch && Boolean(opts.search?.trim());
  const actualLimit = isAllPeriodSearchActive ? 100 : limit;

  // イベント取得
  // ソート: disclosed_at DESC NULLS LAST（実開示日時優先）→ detected_at DESC → created_at DESC
  let query = supabase
    .from("tdnet_events")
    .select("id, created_at, detected_at, disclosed_at, ticker, company_name, market, event_type, event_subtype, headline, source_title, source_url, pdf_url, strength_score, priority_rank, primary_metric_name, primary_metric_value, primary_metric_yoy, display_title, display_summary, sort_key, dedupe_key, notify_to_discord, discord_sent_at, archived_at, status, schema_version, raw_payload")
    .order("disclosed_at", { ascending: false, nullsFirst: false })
    .order("detected_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(actualLimit);

  if (!opts.showArchived) {
    query = query.eq("status", "active");
  }

  if (opts.discordOnly) {
    query = query.eq("notify_to_discord", true);
  }

  if (opts.eventType) {
    if (opts.eventType === "forecast_up") {
      query = query.eq("event_type", "forecast").eq("event_subtype", "upward");
    } else if (opts.eventType === "forecast") {
      query = query.eq("event_type", "forecast");
    } else if (opts.eventType === "dividend") {
      query = query.eq("event_type", "dividend");
    } else if (opts.eventType === "earnings") {
      // 決算タブ専用: 数値決算 + viewer-only決算説明資料
      // 副作用の少ない4条件のみ。見込み・補足説明は除外しない。
      query = query
        .in("event_type", ["earnings", "earnings_material"])
        .not("headline", "ilike", "%一部訂正%")       // 1. 「一部訂正」を含む
        .not("headline", "ilike", "%定時株主総会%")    // 2. 「定時株主総会」を含む
        .not("headline", "ilike", "%継続開催%")        // 3. 「継続開催」を含む
        .not("headline", "ilike", "%決算短信%訂正%"); // 4. 「決算短信」＋「訂正」を含む
    } else {
      query = query.eq("event_type", opts.eventType);
    }
  }

  if (opts.search) {
    const s = opts.search.trim().toUpperCase();
    const tickerMatch = s.match(/^([0-9]{4}|[0-9]{3}[A-Z])(?:\s|　|$)/);
    if (opts.allPeriodTickerSearch && tickerMatch) {
      // 全期間ティッカー検索ONかつ数値の場合はティッカー完全一致のみにする（limit落ち防止と精度向上）
      query = query.eq("ticker", tickerMatch[1]);
    } else if (tickerMatch) {
      // 通常時も先頭4桁があればティッカー OR その他
      query = query.or(`ticker.eq.${tickerMatch[1]},company_name.ilike.%${s}%,headline.ilike.%${s}%`);
    } else {
      query = query.or(`company_name.ilike.%${s}%,headline.ilike.%${s}%`);
    }
  }

  // 全タブ共通除外: ノイズ・訂正系開示を表示しない（DBからは削除しない）
  query = query
    .not("headline", "ilike", "%訂正・数値データ訂正%")  // 既存
    .not("headline", "ilike", "%一部訂正%")              // 新規
    .not("headline", "ilike", "%一部変更%")              // 新規
    .not("headline", "ilike", "%再訂正%");               // 新規

  // 日付フィルタ (JST日付 → UTC範囲変換)
  const _jstDateToUtcRange = (dateStr: string): { gte: string; lt: string } => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 9 * 60 * 60 * 1000);
    const endUtc   = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
    return { gte: startUtc.toISOString(), lt: endUtc.toISOString() };
  };

  if (opts.starredOnly) {
    // スター済みのイベントIDを先に取得（limitや期間で漏れるのを防ぐため）
    const { data: starsData, error: starsErr } = await supabase
      .from("tdnet_event_stars")
      .select("event_id")
      .eq("user_id", opts.userId)
      .order("starred_at", { ascending: false })
      .limit(actualLimit);
    
    if (starsErr) throw starsErr;
    if (!starsData || starsData.length === 0) return [];
    
    const starredIds = starsData.map((s: any) => s.event_id);
    query = query.in("id", starredIds);
  }

  const skipDateFilter = isAllPeriodSearchActive;

  if (opts.selectedDate) {
    // 特定日付フィルタ (selectedDate = "today" or "YYYY-MM-DD")
    const dateStr =
      opts.selectedDate === "today"
        ? new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }))
            .toLocaleDateString("sv") // "YYYY-MM-DD" (sv locale)
        : opts.selectedDate;
    const { gte, lt } = _jstDateToUtcRange(dateStr);
    if (!skipDateFilter) {
      query = query.gte("disclosed_at", gte).lt("disclosed_at", lt);
    }
  } else if (opts.todayOnly) {
    // 後方互換
    const todayJst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }))
      .toLocaleDateString("sv");
    const { gte, lt } = _jstDateToUtcRange(todayJst);
    if (!skipDateFilter) {
      query = query.gte("detected_at", gte).lt("detected_at", lt);
    }
  } else if (!opts.search && !opts.starredOnly) {
    // 通常モード: 直近30日のみ取得（全期間だと古いデータが大量混入するため）
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);
    query = query.gte("detected_at", thirtyDaysAgo.toISOString());
  }

  const { data: events, error } = await query;
  if (error) throw error;
  if (!events || events.length === 0) {
    return [];
  }

  // 既読情報を一括取得
  const eventIds = events.map((e: any) => e.id);
  const { data: reads } = await supabase
    .from("tdnet_event_reads")
    .select("event_id")
    .eq("user_id", opts.userId)
    .in("event_id", eventIds);

  const readSet = new Set((reads || []).map((r: { event_id: string }) => r.event_id));

  // スター情報を一括取得
  const { data: stars } = await supabase
    .from("tdnet_event_stars")
    .select("event_id")
    .eq("user_id", opts.userId)
    .in("event_id", eventIds);

  const starSet = new Set((stars || []).map((s: { event_id: string }) => s.event_id));

  // コメント数を一括取得
  const { data: commentCounts } = await supabase
    .from("tdnet_event_comments")
    .select("event_id")
    .in("event_id", eventIds);

  const commentCountMap = new Map<string, number>();
  (commentCounts || []).forEach((c: { event_id: string }) => {
    commentCountMap.set(c.event_id, (commentCountMap.get(c.event_id) || 0) + 1);
  });

  // Enriched events を作成
  let enriched: EnrichedEvent[] = events.map((e: any) => {
    // raw_payload の復元 (一覧取得の軽量化対応)
    const reconstructedPayload: Record<string, unknown> = {};
    
    // JSの実行環境やSupabaseのバージョンによっては JSON -> string で返る可能性があるため安全にparseする
    const parseIfString = (val: any) => typeof val === "string" ? (() => { try { return JSON.parse(val); } catch { return val; } })() : val;

    if (e.raw_payload !== undefined) {
      const parsedRaw = parseIfString(e.raw_payload) || {};
      if (parsedRaw.extracted !== undefined) {
        reconstructedPayload.extracted = parsedRaw.extracted;
      }
      if (parsedRaw.notification_compare_json !== undefined) {
        reconstructedPayload.notification_compare_json = parsedRaw.notification_compare_json;
      }
    }
    
    return {
      ...e,
      raw_payload: reconstructedPayload,
      is_read: readSet.has(e.id),
      is_starred: starSet.has(e.id),
      comments_count: commentCountMap.get(e.id) || 0,
    };
  });

  // フィルタ
  if (opts.unreadOnly) {
    enriched = enriched.filter((e) => !e.is_read);
  }
  // starredOnly のフィルタは事前のIN句で担保されるためここでは不要

  // ソート: 未読優先 → priority_rank asc → detected_at desc
  // skipClientSort=true の場合は DB 取得順 (disclosed_at DESC, detected_at DESC) を維持
  if (!opts.skipClientSort) {
    enriched.sort((a, b) => {
      if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
      if (a.priority_rank !== b.priority_rank) return a.priority_rank - b.priority_rank;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });
  }

  // ── YOY 補完 ──────────────────────────────────────────────────────────────
  // earnings イベントで sales_yoy / op_yoy が null の銘柄に対し、
  // financials テーブルから前年同期値をバッチ取得して補完する。
  // DB write は一切行わない。extracted の内容を in-memory で上書きするだけ。
  try {
    const earningsWithMissingYoy = enriched.filter(
      (e) =>
        e.event_type === "earnings" &&
        (() => {
          const rp = e.raw_payload as Record<string, unknown>;
          const ext = (rp?.extracted ?? {}) as Record<string, unknown>;
          return ext.sales_yoy == null || ext.op_yoy == null;
        })()
    );
    if (earningsWithMissingYoy.length > 0) {
      const tickers = [...new Set(earningsWithMissingYoy.map((e) => e.ticker))];
      // financials テーブルから対象 tickers をチャンク並列取得
      // 5/15 等の大量決算日は ticker 数が 300件超・行数が 9,000件超になるため、
      // 20件チャンクに分割し Promise.all で並列取得する。
      // 直列だと 18チャンク×平均191ms=3,400ms かかるが、並列化で ~400ms に改善。
      // （ticker あたり最大約46行の履歴データがあるため、50件×limit=1000では切れる）
      const CHUNK_SIZE = 20;
      const chunks: string[][] = [];
      for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
        chunks.push(tickers.slice(i, i + CHUNK_SIZE));
      }
      const chunkResults = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from("financials")
            .select("ticker,period,quarter,sales,operating_profit,unit")
            .in("ticker", chunk)
            .order("period", { ascending: false })
            .limit(2000)
        )
      );
      const allFinRows: FinancialsRow[] = chunkResults.flatMap(
        ({ data }) => (data as FinancialsRow[] | null) ?? []
      );
      const finRows = allFinRows;

      if (finRows && finRows.length > 0) {
        // ticker -> period -> quarter -> row の Map を構築
        const finMap: Record<string, Record<string, Record<string, FinancialsRow>>> = {};
        for (const row of finRows as FinancialsRow[]) {
          if (!finMap[row.ticker]) finMap[row.ticker] = {};
          if (!finMap[row.ticker][row.period]) finMap[row.ticker][row.period] = {};
          // 同 period/quarter が複数ある場合、jquants ソース優先（order済みなので先勝ち）
          if (!finMap[row.ticker][row.period][row.quarter]) {
            finMap[row.ticker][row.period][row.quarter] = row;
          }
        }

        // 各イベントに YOY を補完
        for (const ev of earningsWithMissingYoy) {
          const rp = ev.raw_payload as Record<string, unknown>;
          const ext = (rp?.extracted ?? {}) as Record<string, unknown>;
          const ncj = rp?.notification_compare_json as any;

          const quarter = String(ext.quarter ?? "");
          if (!quarter) continue;

          // extracted.op_current (円単位) → 百万円に変換して financials と照合
          const opCurrRaw = ext.op_current;
          const salesCurrRaw = ext.sales_current;
          const opCurrM = opCurrRaw != null ? Number(opCurrRaw) / 1_000_000 : null;
          const salesCurrM = salesCurrRaw != null ? Number(salesCurrRaw) / 1_000_000 : null;

          // 当期 period を financials から特定
          const tickerPeriods = Object.keys(finMap[ev.ticker] ?? {}).sort().reverse();
          let currPeriod: string | null = null;

          // exactPeriod をイベントから取得できれば最優先で使用
          const exactPeriod = String(ext.period || ext.fiscal_period || "");
          if (exactPeriod && exactPeriod.includes("-") && finMap[ev.ticker][exactPeriod]?.[quarter]) {
            currPeriod = exactPeriod;
          } else {
            // 取得できない場合は、op_current / sales_current の値で照合する
            for (const period of tickerPeriods) {
              const row = finMap[ev.ticker][period]?.[quarter];
              if (!row) continue;
              const opMatch =
                opCurrM != null &&
                row.operating_profit != null &&
                Math.round(row.operating_profit) === Math.round(opCurrM);
              const salesMatch =
                salesCurrM != null &&
                row.sales != null &&
                Math.round(row.sales) === Math.round(salesCurrM);
              if (opMatch || salesMatch) {
                currPeriod = period;
                break;
              }
            }
          }

          // 照合できなかった場合は補完をスキップする (危険な過去periodのフォールバックを削除)
          if (!currPeriod) continue;

          const currRow = finMap[ev.ticker][currPeriod][quarter];
          if (!currRow) continue;

          // 前年 period: 同じ月日で年を1つ下げる
          const prevPeriod = prevFiscalYearPeriod(currPeriod);
          const prevRow = finMap[ev.ticker][prevPeriod]?.[quarter];
          if (!prevRow) continue;

          // sales_yoy 補完 (null のときのみ)
          if (ext.sales_yoy == null && currRow.sales != null && prevRow.sales != null && prevRow.sales !== 0) {
            const yoy = (currRow.sales - prevRow.sales) / Math.abs(prevRow.sales);
            if (isFinite(yoy) && !isNaN(yoy)) {
              (rp.extracted as Record<string, unknown>).sales_yoy = yoy;
              // notification_compare_json.current.sales_yoy も補完
              if (ncj?.current && ncj.current.sales_yoy == null) {
                ncj.current.sales_yoy = yoy;
              }
            }
          }

          // op_yoy 補完 (null のときのみ、両方の値が有効な場合)
          if (
            ext.op_yoy == null &&
            currRow.operating_profit != null &&
            prevRow.operating_profit != null &&
            prevRow.operating_profit !== 0
          ) {
            const yoy =
              (currRow.operating_profit - prevRow.operating_profit) /
              Math.abs(prevRow.operating_profit);
            if (isFinite(yoy) && !isNaN(yoy)) {
              (rp.extracted as Record<string, unknown>).op_yoy = yoy;
              // notification_compare_json.current.op_yoy も補完
              if (ncj?.current && ncj.current.op_yoy == null) {
                ncj.current.op_yoy = yoy;
              }
            }
          }

          // op_current が null だが financials にある場合は補完 (赤字判定に必要)
          if (ext.op_current == null && currRow.operating_profit != null) {
            (rp.extracted as Record<string, unknown>).op_current = currRow.operating_profit * 1_000_000;
          }
        }
      }
    }
  } catch (err) {
    // financials 補完エラーは無視して通常表示を維持する
    console.warn("[TDNET fetchEvents] financials YOY補完エラー (無視):", err);
  }
  // ── YOY 補完ここまで ────────────────────────────────────────────────────

  // ── EDINET受注 YOY補完 ───────────────────────────────────────────────────
  try {
    const ordersWithMissingYoy = enriched.filter(
      (e) =>
        e.event_type === "edinet_order" &&
        (() => {
          const rp = e.raw_payload as Record<string, unknown>;
          const ext = (rp?.extracted ?? {}) as Record<string, unknown>;
          return ext.orders_received_yoy == null || ext.order_backlog_yoy == null;
        })()
    );

    if (ordersWithMissingYoy.length > 0) {
      const tickers = [...new Set(ordersWithMissingYoy.map((e) => e.ticker))];
      const CHUNK_SIZE = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
        chunks.push(tickers.slice(i, i + CHUNK_SIZE));
      }
      const chunkResults = await Promise.all(
        chunks.map((chunk) =>
          supabase
            .from("edinet_order_data")
            .select("ticker,period,orders_received,order_backlog,source_unit,segment_name")
            .in("ticker", chunk)
            .order("period", { ascending: false })
            .limit(1000)
        )
      );

      const allOrderRows = chunkResults.flatMap(({ data }) => (data as any[]) || []);

      if (allOrderRows.length > 0) {
        // ticker -> period -> row
        const orderMap: Record<string, Record<string, any>> = {};
        for (const row of allOrderRows) {
          if (!orderMap[row.ticker]) orderMap[row.ticker] = {};
          const current = orderMap[row.ticker][row.period];
          // __ALL__ または 全社 を優先。なければ最初に見つかったものを保持。
          if (!current || row.segment_name === "__ALL__" || row.segment_name === "全社") {
            orderMap[row.ticker][row.period] = row;
          }
        }

        for (const ev of ordersWithMissingYoy) {
          const rp = ev.raw_payload as Record<string, unknown>;
          const ext = (rp?.extracted ?? {}) as Record<string, unknown>;
          
          let currPeriod = String(ext.period || ext.fiscal_period || "");
          if (!currPeriod || !currPeriod.includes("-")) {
            // 危険なフォールバックを削除: yyyy-mm-dd形式が見つからない場合は補完をスキップする
            currPeriod = "";
          }
          if (!currPeriod) continue;

          const currRow = orderMap[ev.ticker]?.[currPeriod];
          if (!currRow) continue;

          const prevPeriod = prevFiscalYearPeriod(currPeriod);
          const prevRow = orderMap[ev.ticker]?.[prevPeriod];
          if (!prevRow) continue;

          const calculateYoy = (currVal: number | null | undefined, prevVal: number | null | undefined): number | null => {
            if (
              currVal == null || prevVal == null || 
              typeof currVal !== "number" || typeof prevVal !== "number" || 
              isNaN(currVal) || isNaN(prevVal) || prevVal === 0
            ) {
              return null;
            }

            const yoy = (currVal - prevVal) / Math.abs(prevVal);
            if (!isFinite(yoy) || isNaN(yoy)) return null;

            // 異常値ガード: -90%以下、または +900%以上は補完しない
            if (yoy <= -0.9 || yoy >= 9.0) {
              console.warn(`[TDNET fetchEvents] YOY Anomaly Guard skip: yoy=${yoy}, curr=${currVal}, prev=${prevVal}`);
              return null;
            }

            return yoy;
          };

          if (ext.orders_received_yoy == null) {
            const yoy = calculateYoy(currRow.orders_received, prevRow.orders_received);
            if (yoy != null) {
              ext.orders_received_yoy = yoy;
            }
          }

          if (ext.order_backlog_yoy == null) {
            const yoy = calculateYoy(currRow.order_backlog, prevRow.order_backlog);
            if (yoy != null) {
              ext.order_backlog_yoy = yoy;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("[TDNET fetchEvents] EDINET order YOY補完エラー (無視):", err);
  }
  // ── EDINET受注 YOY補完ここまで ────────────────────────────────────────────────

  console.log("[TDNET fetchEvents] フィルター後件数:", enriched.length, "|",
    opts.unreadOnly ? "unreadOnly" : "",
    opts.starredOnly ? "starredOnly" : "",
    "(DB:", events.length, "-> 表示:", enriched.length, ")"
  );
  return enriched;
}

// ============================================================
// financials YOY 補完ヘルパー
// ============================================================

/** financials テーブルの行型 (SELECT 結果) */
interface FinancialsRow {
  ticker: string;
  period: string;
  quarter: string;
  sales: number | null;
  operating_profit: number | null;
  unit: string | null;
}

/**
 * 会計期末日 (YYYY-MM-DD) から前年の同じ期末日を返す。
 * 例: "2026-09-30" → "2025-09-30"
 * うるう年 (2/29) の場合は 2/28 にフォールバック。
 */
function prevFiscalYearPeriod(period: string): string {
  const [y, m, d] = period.split("-").map(Number);
  // 前年同月末日: 年を1つ引いた後、同じ月末日を使う
  const prevYear = y - 1;
  // 月末日は元のdをそのまま使う（うるう年2/29→前年は2/28を試みる）
  const candidate = `${prevYear}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  // バリデーション: Date で確認
  const dt = new Date(candidate);
  if (isNaN(dt.getTime())) {
    // うるう年2/29 → 2/28 にフォールバック
    return `${prevYear}-${String(m).padStart(2, "0")}-28`;
  }
  return candidate;
}

// ============================================================
// 既読操作
// ============================================================
export async function markAsRead(supabase: SupabaseClient, eventId: string, userId: string) {
  const { error } = await supabase
    .from("tdnet_event_reads")
    .upsert({ event_id: eventId, user_id: userId }, { onConflict: "event_id,user_id" });
  if (error) throw error;
}

export async function markAsUnread(supabase: SupabaseClient, eventId: string, userId: string) {
  const { error } = await supabase
    .from("tdnet_event_reads")
    .delete()
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ============================================================
// スター操作
// ============================================================
export async function toggleStar(supabase: SupabaseClient, eventId: string, userId: string, isStarred: boolean) {
  if (isStarred) {
    const { error } = await supabase.from("tdnet_event_stars").delete().eq("event_id", eventId).eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("tdnet_event_stars").upsert({ event_id: eventId, user_id: userId }, { onConflict: "event_id,user_id" });
    if (error) throw error;
  }
}

// ============================================================
// コメント操作
// ============================================================
export async function fetchComments(supabase: SupabaseClient, eventId: string): Promise<TdnetEventComment[]> {
  const { data, error } = await supabase
    .from("tdnet_event_comments")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addComment(supabase: SupabaseClient, eventId: string, userId: string, comment: string) {
  const { error } = await supabase
    .from("tdnet_event_comments")
    .insert({ event_id: eventId, user_id: userId, comment });
  if (error) throw error;
}

export async function deleteComment(supabase: SupabaseClient, commentId: string, userId: string) {
  const { error } = await supabase
    .from("tdnet_event_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ============================================================
// セグメント業績取得
// ============================================================
export interface SegmentRow {
  segment_name: string;
  segment_sales: number | null;
  segment_profit: number | null;
  period: string | null;
  quarter: string | null;
  data_source: string | null;
}

/**
 * segment_financials からセグメント業績を取得する。
 * company_code / fiscal_year_end / quarter で絞り込み。
 * period / quarter が null の場合は ticker のみで最新件を取得。
 */
export async function fetchSegmentFinancials(
  supabase: SupabaseClient,
  ticker: string,
  period?: string | null,
  quarter?: string | null,
): Promise<SegmentRow[]> {
  try {
    let q = supabase
      .from("segment_financials")
      .select("segment_name, segment_sales, segment_profit, period, quarter, data_source")
      .eq("ticker", ticker)
      .neq("data_source", "excel_legacy")  // excel_legacy を除外
      .order("period", { ascending: false })
      .order("segment_name", { ascending: true })
      .limit(100);

    // デバッグ: period/quarter filter 一時無効
    // if (period) q = q.eq("period", period);
    // if (quarter) q = q.eq("quarter", quarter);

    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as SegmentRow[];
  } catch {
    // テーブル不在またはRLS拒否の場合は空を返す
    return [];
  }
}
