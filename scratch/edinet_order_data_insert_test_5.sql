-- ============================================================
-- edinet_order_data_insert_test_5.sql
-- 実INSERT テスト — 5社のみ
-- generated_at: 2026-06-15T05:50:43.711Z
-- 対象: 1812 鹿島建設 / 6141 DMG森精機 / 6834 精工技研 / 8035 東京エレクトロン / 5805 SWCC
-- 確認ポイント:
--   1. segment_name_key = '__ALL__' (generated column の自動生成)
--   2. 千円単位の raw_* と百万円変換後の差分
--   3. RPO が rpo カラムに入り order_backlog に混入しないこと
--   4. medium confidence の値が格納されること
--   5. RLS により allowed_users 経由で SELECT できること
-- ============================================================

-- 事前確認: テーブルが存在し RLS が有効か
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname='public' AND tablename='edinet_order_data';
-- [1/5] 1812 鹿島建設  period:2025-03-31  fiscal_year:2025  source_unit:million_yen  confidence:high
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('1812', '鹿島建設', 'S100W14C', '2025-03-31', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 1773567, NULL, 2514070, 1457617, NULL, 1773567, NULL, 2514070, 1457617, NULL, 'Header: 期別|期別|種類別|種類別|期首繰越高(百万円)|当期受注高(百万円)|計(百万円)|当期売上高(百万円)|期末繰越高(百万円)
Row: 自2024年4月1日|至2025年3月31日|建設事業|計|2,198,120|1,773,567|3,971,688|1,457,617|2,514,070')
ON CONFLICT ON CONSTRAINT edinet_order_data_uniq DO UPDATE SET
    orders_received = EXCLUDED.orders_received,
    raw_orders_received = EXCLUDED.raw_orders_received,
    order_backlog = EXCLUDED.order_backlog,
    raw_order_backlog = EXCLUDED.raw_order_backlog,
    construction_carryover = EXCLUDED.construction_carryover,
    raw_construction_carryover = EXCLUDED.raw_construction_carryover,
    completed_construction = EXCLUDED.completed_construction,
    raw_completed_construction = EXCLUDED.raw_completed_construction,
    rpo = EXCLUDED.rpo,
    raw_rpo = EXCLUDED.raw_rpo,
    source_unit = EXCLUDED.source_unit,
    confidence = EXCLUDED.confidence,
    null_reason = EXCLUDED.null_reason,
    snippet = EXCLUDED.snippet,
    doc_id = EXCLUDED.doc_id,
    source_tag = EXCLUDED.source_tag,
    updated_at = now();

-- [2/5] 5805 SWCC  period:2025-03-31  fiscal_year:2025  source_unit:million_yen  confidence:medium
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('5805', 'SWCC', 'S100W4C3', '2025-03-31', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:NotesRevenueRecognitionConsolidatedFinancialStatementsTextBlock', 'medium', NULL, 'million_yen', NULL, NULL, NULL, NULL, 1997, NULL, NULL, NULL, NULL, 1997, '収益を認識することを見込んでおります。当連結会計年度における残存履行義務に配分した取引価格の総額は1,997百万円であり')
ON CONFLICT ON CONSTRAINT edinet_order_data_uniq DO UPDATE SET
    orders_received = EXCLUDED.orders_received,
    raw_orders_received = EXCLUDED.raw_orders_received,
    order_backlog = EXCLUDED.order_backlog,
    raw_order_backlog = EXCLUDED.raw_order_backlog,
    construction_carryover = EXCLUDED.construction_carryover,
    raw_construction_carryover = EXCLUDED.raw_construction_carryover,
    completed_construction = EXCLUDED.completed_construction,
    raw_completed_construction = EXCLUDED.raw_completed_construction,
    rpo = EXCLUDED.rpo,
    raw_rpo = EXCLUDED.raw_rpo,
    source_unit = EXCLUDED.source_unit,
    confidence = EXCLUDED.confidence,
    null_reason = EXCLUDED.null_reason,
    snippet = EXCLUDED.snippet,
    doc_id = EXCLUDED.doc_id,
    source_tag = EXCLUDED.source_tag,
    updated_at = now();

-- [3/5] 6141 DMG森精機  period:2025-12-31  fiscal_year:2025  source_unit:million_yen  confidence:high
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6141', 'DMG森精機', 'S100XUMY', '2025-12-31', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 523370, 240533, NULL, NULL, NULL, 523370, 240533, NULL, NULL, NULL, 'Header: |受注高(百万円)|前年同期比(%)|受注残高(百万円)|前年同期比(%)
Row: 受注実績|523,370|5.5|240,533|10.3')
ON CONFLICT ON CONSTRAINT edinet_order_data_uniq DO UPDATE SET
    orders_received = EXCLUDED.orders_received,
    raw_orders_received = EXCLUDED.raw_orders_received,
    order_backlog = EXCLUDED.order_backlog,
    raw_order_backlog = EXCLUDED.raw_order_backlog,
    construction_carryover = EXCLUDED.construction_carryover,
    raw_construction_carryover = EXCLUDED.raw_construction_carryover,
    completed_construction = EXCLUDED.completed_construction,
    raw_completed_construction = EXCLUDED.raw_completed_construction,
    rpo = EXCLUDED.rpo,
    raw_rpo = EXCLUDED.raw_rpo,
    source_unit = EXCLUDED.source_unit,
    confidence = EXCLUDED.confidence,
    null_reason = EXCLUDED.null_reason,
    snippet = EXCLUDED.snippet,
    doc_id = EXCLUDED.doc_id,
    source_tag = EXCLUDED.source_tag,
    updated_at = now();

-- [4/5] 6834 精工技研  period:2025-03-31  fiscal_year:2025  source_unit:thousand_yen  confidence:high
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6834', '精工技研', 'S100VYS0', '2025-03-31', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'thousand_yen', 21380102, 4384826, NULL, NULL, NULL, 21380, 4384, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(千円)|前年同期比(%)|受注残高(千円)|前年同期比(%)
Row: 合計|21,380,102|133.7|4,384,826|157.8')
ON CONFLICT ON CONSTRAINT edinet_order_data_uniq DO UPDATE SET
    orders_received = EXCLUDED.orders_received,
    raw_orders_received = EXCLUDED.raw_orders_received,
    order_backlog = EXCLUDED.order_backlog,
    raw_order_backlog = EXCLUDED.raw_order_backlog,
    construction_carryover = EXCLUDED.construction_carryover,
    raw_construction_carryover = EXCLUDED.raw_construction_carryover,
    completed_construction = EXCLUDED.completed_construction,
    raw_completed_construction = EXCLUDED.raw_completed_construction,
    rpo = EXCLUDED.rpo,
    raw_rpo = EXCLUDED.raw_rpo,
    source_unit = EXCLUDED.source_unit,
    confidence = EXCLUDED.confidence,
    null_reason = EXCLUDED.null_reason,
    snippet = EXCLUDED.snippet,
    doc_id = EXCLUDED.doc_id,
    source_tag = EXCLUDED.source_tag,
    updated_at = now();

-- [5/5] 8035 東京エレクトロン  period:2025-03-31  fiscal_year:2025  source_unit:million_yen  confidence:medium
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('8035', '東京エレクトロン', 'S100VX9R', '2025-03-31', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:NotesRevenueRecognitionConsolidatedFinancialStatementsTextBlock', 'medium', NULL, 'million_yen', NULL, NULL, NULL, NULL, 225019, NULL, NULL, NULL, NULL, 225019, 'また、当連結会計年度末において未充足(又は部分的に未充足)の履行義務は225,019百万円であり、このうち約8割は、期末')
ON CONFLICT ON CONSTRAINT edinet_order_data_uniq DO UPDATE SET
    orders_received = EXCLUDED.orders_received,
    raw_orders_received = EXCLUDED.raw_orders_received,
    order_backlog = EXCLUDED.order_backlog,
    raw_order_backlog = EXCLUDED.raw_order_backlog,
    construction_carryover = EXCLUDED.construction_carryover,
    raw_construction_carryover = EXCLUDED.raw_construction_carryover,
    completed_construction = EXCLUDED.completed_construction,
    raw_completed_construction = EXCLUDED.raw_completed_construction,
    rpo = EXCLUDED.rpo,
    raw_rpo = EXCLUDED.raw_rpo,
    source_unit = EXCLUDED.source_unit,
    confidence = EXCLUDED.confidence,
    null_reason = EXCLUDED.null_reason,
    snippet = EXCLUDED.snippet,
    doc_id = EXCLUDED.doc_id,
    source_tag = EXCLUDED.source_tag,
    updated_at = now();

-- ============================================================
-- INSERT 後確認 SELECT
-- ============================================================

SELECT
    ticker,
    company_name,
    period,
    fiscal_year,
    orders_received,
    order_backlog,
    construction_carryover,
    completed_construction,
    rpo,
    raw_orders_received,
    raw_order_backlog,
    raw_rpo,
    source_unit,
    segment_name,
    segment_name_key,
    confidence,
    null_reason
FROM edinet_order_data
WHERE ticker IN ('1812','6141','6834','8035','5805')
ORDER BY ticker;