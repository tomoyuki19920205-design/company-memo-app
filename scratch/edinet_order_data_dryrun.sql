-- ============================================================
-- edinet_order_data_dryrun.sql
-- INSERT DRY RUN — SQL実行禁止 / DB NOT MODIFIED
-- generated_at: 2026-06-15T05:34:10.023Z
-- source: tdnet-excel-input/scratch/orders_extracted_30_v4.json
-- rows: 31
-- !! このファイルは確認用です。実際に実行する場合は内容を確認してから実行 !!
-- ============================================================

-- UPSERT key: ON CONFLICT ON CONSTRAINT edinet_order_data_uniq
-- segment_name_key は generated column のため INSERT 対象外
-- [1/31] 1762 高松コンストラクション (confidence:medium, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('1762', '高松コンストラクション', 'S100VXNT', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'medium', NULL, 'million_yen', 99008, NULL, NULL, NULL, NULL, 99008, NULL, NULL, NULL, NULL, '778百万円(前期比30.0%減)となりました。(土木事業)受注高は99,008百万円(前期比4.0%減)、完成工事高は')
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

-- [2/31] 1802 大林組 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('1802', '大林組', 'S100W0FJ', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 2044406, NULL, 2779344, 1660662, NULL, 2044406, NULL, 2779344, 1660662, NULL, 'Header: 期別|種類別|種類別|前期繰越高(百万円)|当期受注高(百万円)|計(百万円)|当期売上高(百万円)|次期繰越高(百万円)
Row: 第121期(自2024年4月1|合計|合計|2,395,601|2,044,406|4,440,007|1,660,662|2,779,344')
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

-- [3/31] 1812 鹿島建設 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('1812', '鹿島建設', 'S100W14C', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 1773567, NULL, 2514070, 1457617, NULL, 1773567, NULL, 2514070, 1457617, NULL, 'Header: 期別|期別|種類別|種類別|期首繰越高(百万円)|当期受注高(百万円)|計(百万円)|当期売上高(百万円)|期末繰越高(百万円)
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

-- [4/31] 1952 新日本空調 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('1952', '新日本空調', 'S100W6DZ', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 153891, NULL, NULL, 137684, NULL, 153891, NULL, NULL, 137684, NULL, 'Header: |受注工事高(百万円)|受注工事高(百万円)|受注工事高(百万円)|受注工事高(百万円)|完成工事高(百万円)|完成工事高(百万円)|完成工事高(百万円)|完成工事高(百万円)
Row: 設備工事事業|141,121|153,891|9.0|%|127,978|137,684|7.6|%')
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

-- [5/31] 1969 高砂熱学工業 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('1969', '高砂熱学工業', 'S100VYJS', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 307974, NULL, 308674, 274274, NULL, 307974, NULL, 308674, 274274, NULL, 'Header: 期別|区分|前期繰越工事高(百万円)|当期受注工事高(百万円)|計(百万円)|当期完成工事高(百万円)|次期繰越工事高(百万円)
Row: 当事業年度(自2024年4月1|計|274,974|307,974|582,949|274,274|308,674')
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

-- [6/31] 5631 日本製鋼所 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('5631', '日本製鋼所', 'S100W0UU', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 310295, 396906, NULL, NULL, NULL, 310295, 396906, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|前期比(%)|受注残高(百万円)|前期比(%)
Row: 合計|310,295|△7.4|396,906|+18.4')
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

-- [7/31] 5805 SWCC (confidence:medium, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('5805', 'SWCC', 'S100W4C3', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:NotesRevenueRecognitionConsolidatedFinancialStatementsTextBlock', 'medium', NULL, 'million_yen', NULL, NULL, NULL, NULL, 1997, NULL, NULL, NULL, NULL, 1997, '収益を認識することを見込んでおります。当連結会計年度における残存履行義務に配分した取引価格の総額は1,997百万円であり')
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

-- [8/31] 5985 サンコール (confidence:low, source_unit:unknown)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('5985', 'サンコール', 'S100W3K3', '2025', 2025, NULL, 'edinet_yuho', NULL, 'low', 'no_table_found', 'unknown', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
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

-- [9/31] 6101 ツガミ (confidence:low, source_unit:unknown)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6101', 'ツガミ', 'S100VY3E', '2025', 2025, NULL, 'edinet_yuho', NULL, 'low', 'no_table_found', 'unknown', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
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

-- [10/31] 6103 オークマ (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6103', 'オークマ', 'S100W043', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 215627, 96452, NULL, NULL, NULL, 215627, 96452, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|前期比(%)|受注残高(百万円)|前期比(%)
Row: 合計|215,627|5.7|96,452|10.0')
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

-- [11/31] 6104 芝浦機械 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6104', '芝浦機械', 'S100W00Q', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 107346, 109477, NULL, NULL, NULL, 107346, 109477, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|受注高(百万円)|受注残高(百万円)|受注残高(百万円)
Row: 合計|107,346|△11.4|109,477|△35.7')
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

-- [12/31] 6141 DMG森精機 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6141', 'DMG森精機', 'S100XUMY', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 523370, 240533, NULL, NULL, NULL, 523370, 240533, NULL, NULL, NULL, 'Header: |受注高(百万円)|前年同期比(%)|受注残高(百万円)|前年同期比(%)
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

-- [13/31] 6254 野村マイクロ・サイエンス (confidence:high, source_unit:thousand_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6254', '野村マイクロ・サイエンス', 'S100W3YM', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'thousand_yen', 94531888, 40770764, NULL, NULL, NULL, 94531, 40770, NULL, NULL, NULL, 'Header: 事業の種類別の名称|受注高|前年同期比(%)|受注残高|前年同期比(%)
Row: 合計(千円)|94,531,888|132.7|40,770,764|95.7')
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

-- [14/31] 6258 平田機工 (confidence:high, source_unit:thousand_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6258', '平田機工', 'S100W3DG', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'thousand_yen', 79512424, 56433341, NULL, NULL, NULL, 79512, 56433, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(千円)|前期比(%)|受注残高(千円)|前期比(%)
Row: 合計|79,512,424|92.2|56,433,341|86.3')
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

-- [15/31] 6266 タツモ (confidence:high, source_unit:thousand_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6266', 'タツモ', 'S100XS15', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'thousand_yen', 23938781, 19658184, NULL, NULL, NULL, 23938, 19658, NULL, NULL, NULL, 'Header: セグメントの名称|セグメントの名称|受注高(千円)|前年同期比(%)|受注残高(千円)|前年同期比(%)
Row: 合計|合計|23,938,781|88.6|19,658,184|63.1')
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

-- [16/31] 6315 TOWA (confidence:high, source_unit:thousand_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6315', 'TOWA', 'S100W53I', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'thousand_yen', 47429464, 25252700, NULL, NULL, NULL, 47429, 25252, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(千円)|前年同期比(%)|受注残高(千円)|前年同期比(%)
Row: 合計|47,429,464|90.0|25,252,700|80.6')
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

-- [17/31] 6323 ローツェ (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6323', 'ローツェ', 'S100VUDZ', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 110081, 58863, NULL, NULL, NULL, 110081, 58863, NULL, NULL, NULL, 'Header: |品目|受注高(百万円)|前年同期比(%)|受注残高(百万円)|前年同期比(%)
Row: 合計|合計|110,081|123.3|58,863|92.0')
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

-- [18/31] 6370 栗田工業 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6370', '栗田工業', 'S100W5YW', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 432953, 147978, NULL, NULL, NULL, 432953, 147978, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|前年同期比(%)|受注残高(百万円)|前年同期比(%)
Row: 合計|432,953|111.0|147,978|119.4')
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

-- [19/31] 6466 TVE (confidence:high, source_unit:thousand_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6466', 'TVE', 'S100XBK6', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'thousand_yen', 13322341, 7228864, NULL, NULL, NULL, 13322, 7228, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(千円)|前年同期比(%)|受注残高(千円)|前年同期比(%)
Row: 合計|13,322,341|25.9|7,228,864|76.7')
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

-- [20/31] 6492 岡野バルブ製造 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6492', '岡野バルブ製造', 'S100XBYD', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 7858, 10316, NULL, NULL, NULL, 7858, 10316, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|前年同期比(%)|受注残高(百万円)|前年同期比(%)
Row: バルブ事業|7,858|-|10,316|-')
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

-- [21/31] 6594 ニデック (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6594', 'ニデック', 'S100WRH7', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 2500573, 691114, NULL, NULL, NULL, 2500573, 691114, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|前年度比(%)|受注残高(百万円)|前年度比(%)
Row: 合計|2,500,573|113.5|691,114|106.7')
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

-- [22/31] 6834 精工技研 (confidence:high, source_unit:thousand_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6834', '精工技研', 'S100VYS0', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'thousand_yen', 21380102, 4384826, NULL, NULL, NULL, 21380, 4384, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(千円)|前年同期比(%)|受注残高(千円)|前年同期比(%)
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

-- [23/31] 6981 村田製作所 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('6981', '村田製作所', 'S100W2ZR', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 1720700, 287495, NULL, NULL, NULL, 1720700, 287495, NULL, NULL, NULL, 'Header: ||受注高(2024年4月1日~2025年3月31日)|受注高(2024年4月1日~2025年3月31日)|受注高(2024年4月1日~2025年3月31日)|受注残高(2025年3月31日現在)|受注残高(2025年3月31日現在)|受注残高(2025年3月31日現在)
Row: |計|1,720,700|100.0|6.8|287,495|100.0|△7.3')
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

-- [24/31] 7011 三菱重工業 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('7011', '三菱重工業', 'S100W6XE', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 7071259, 10236296, NULL, NULL, NULL, 7071259, 10236296, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|前連結会計年度比(%)|受注残高(百万円)|前連結会計年度比(%)
Row: 合計|7,071,259|+5.8|10,236,296|+21.9')
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

-- [25/31] 7013 IHI (confidence:high, source_unit:billion_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('7013', 'IHI', 'S100W1K1', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'billion_yen', 17511, NULL, NULL, NULL, NULL, 1751100, NULL, NULL, NULL, NULL, 'Header: 報告セグメント|受注高|受注高|受注高|前連結会計年度|前連結会計年度|当連結会計年度|当連結会計年度|前年度比|前年度比
Row: 合計|13,768|17,511|27.2|13,225|△701|16,268|1,435|23.0|-')
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

-- [26/31] 7014 名村造船所 (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('7014', '名村造船所', 'S100W4QD', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 234792, 406493, NULL, NULL, NULL, 234792, 406493, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|前年同期増減率(%)|受注残高(百万円)|前期末増減率(%)
Row: 合計|234,792|31.2|406,493|23.0')
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

-- [27/31] 7735 SCREENホールディングス (confidence:low, source_unit:unknown)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('7735', 'SCREENホールディングス', 'S100VZW3', '2025', 2025, NULL, 'edinet_yuho', NULL, 'low', 'no_table_found', 'unknown', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
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

-- [28/31] 8035 東京エレクトロン (confidence:medium, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('8035', '東京エレクトロン', 'S100VX9R', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:NotesRevenueRecognitionConsolidatedFinancialStatementsTextBlock', 'medium', NULL, 'million_yen', NULL, NULL, NULL, NULL, 225019, NULL, NULL, NULL, NULL, 225019, 'また、当連結会計年度末において未充足(又は部分的に未充足)の履行義務は225,019百万円であり、このうち約8割は、期末')
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

-- [29/31] 9682 DTS (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('9682', 'DTS', 'S100W4BF', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 132482, 39331, NULL, NULL, NULL, 132482, 39331, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|対前年同期増減率(%)|受注残高(百万円)|対前年同期増減率(%)
Row: 合計|132,482|15.7|39,331|23.2')
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

-- [30/31] 9719 SCSK (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('9719', 'SCSK', 'S100W3BI', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 659361, 391732, NULL, NULL, NULL, 659361, 391732, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|前期比(%)|受注残高(百万円)|前期比(%)
Row: 合計|659,361|+33.3|391,732|+78.9')
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

-- [31/31] 9749 富士ソフト (confidence:high, source_unit:million_yen)
INSERT INTO edinet_order_data (ticker, company_name, doc_id, period, fiscal_year, segment_name, source_type, source_tag, confidence, null_reason, source_unit, raw_orders_received, raw_order_backlog, raw_construction_carryover, raw_completed_construction, raw_rpo, orders_received, order_backlog, construction_carryover, completed_construction, rpo, snippet)
VALUES ('9749', '富士ソフト', 'S100VCF7', '2025', 2025, NULL, 'edinet_yuho', 'jpcrp_cor:ManagementAnalysisOfFinancialPositionOperatingResultsAndCashFlowsTextBlock', 'high', NULL, 'million_yen', 326712, 88597, NULL, NULL, NULL, 326712, 88597, NULL, NULL, NULL, 'Header: セグメントの名称|受注高(百万円)|前年同期比(%)|受注残高(百万円)|前年同期比(%)
Row: 合計|326,712|108.7|88,597|111.6')
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

