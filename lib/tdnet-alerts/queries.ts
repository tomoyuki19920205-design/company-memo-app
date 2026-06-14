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
      // 決算タブ専用: event_type = earnings のうち以下を除外
      // 副作用の少ない4条件のみ。見込み・補足説明は除外しない。
      query = query
        .eq("event_type", "earnings")
        .not("headline", "ilike", "%一部訂正%")       // 1. 「一部訂正」を含む
        .not("headline", "ilike", "%定時株主総会%")    // 2. 「定時株主総会」を含む
        .not("headline", "ilike", "%継続開催%")        // 3. 「継続開催」を含む
        .not("headline", "ilike", "%決算短信%訂正%"); // 4. 「決算短信」＋「訂正」を含む
    } else {
      query = query.eq("event_type", opts.eventType);
    }
  }

  if (opts.search) {
    const s = opts.search.trim();
    if (opts.allPeriodTickerSearch && /^\d{4}$/.test(s)) {
      // 全期間ティッカー検索ONかつ数値の場合はティッカー完全一致のみにする（limit落ち防止と精度向上）
      query = query.eq("ticker", s);
    } else if (/^\d{4}$/.test(s)) {
      query = query.or(`ticker.eq.${s},company_name.ilike.%${s}%,headline.ilike.%${s}%`);
    } else {
      query = query.or(`ticker.ilike.%${s}%,company_name.ilike.%${s}%,headline.ilike.%${s}%`);
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
  } else if (!opts.search) {
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
  if (opts.starredOnly) {
    enriched = enriched.filter((e) => e.is_starred);
  }

  // ソート: 未読優先 → priority_rank asc → detected_at desc
  // skipClientSort=true の場合は DB 取得順 (disclosed_at DESC, detected_at DESC) を維持
  if (!opts.skipClientSort) {
    enriched.sort((a, b) => {
      if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
      if (a.priority_rank !== b.priority_rank) return a.priority_rank - b.priority_rank;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });
  }

  console.log("[TDNET fetchEvents] フィルター後件数:", enriched.length, "|",
    opts.unreadOnly ? "unreadOnly" : "",
    opts.starredOnly ? "starredOnly" : "",
    "(DB:", events.length, "-> 表示:", enriched.length, ")"
  );
  return enriched;
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
    await supabase.from("tdnet_event_stars").delete().eq("event_id", eventId).eq("user_id", userId);
  } else {
    await supabase.from("tdnet_event_stars").upsert({ event_id: eventId, user_id: userId }, { onConflict: "event_id,user_id" });
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
