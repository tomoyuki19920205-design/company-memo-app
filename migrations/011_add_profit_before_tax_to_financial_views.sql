-- Publish official profit_before_tax without changing actual/forecast scope.
BEGIN;

CREATE OR REPLACE VIEW public.api_latest_financials_canonical AS
WITH ranked AS (
    SELECT cf.*,
        ROW_NUMBER() OVER (
            PARTITION BY cf.ticker, cf.period, cf.quarter, cf.metric
            ORDER BY cf.source_priority, cf.recency_key DESC
        ) AS rn
    FROM public.canonical_financials AS cf
    WHERE NOT (
        cf.source = 'tdnet'
        AND cf.filing_id IS NULL
        AND cf.disclosure_datetime IS NULL
    )
      AND cf.source NOT IN (
          'jquants_nxf', 'jquants_forecast_fy',
          'jquants_forecast_next_fy', 'jquants_forecast', 'tdnet_forecast'
      )
), filtered AS (
    SELECT * FROM ranked WHERE rn = 1
)
SELECT
    ticker, period, quarter,
    MAX(value) FILTER (WHERE metric = 'sales') AS sales,
    MAX(value) FILTER (WHERE metric = 'gross_profit') AS gross_profit,
    MAX(value) FILTER (WHERE metric = 'operating_profit') AS operating_profit,
    MAX(value) FILTER (WHERE metric = 'ordinary_profit') AS ordinary_profit,
    MAX(value) FILTER (WHERE metric = 'net_income') AS net_income,
    MAX(value) FILTER (WHERE metric = 'eps') AS eps,
    COALESCE(MAX(source) FILTER (WHERE metric = 'sales'), MAX(source)) AS source,
    MAX(updated_at) AS updated_at,
    MAX(value) FILTER (WHERE metric = 'profit_before_tax') AS profit_before_tax
FROM filtered
GROUP BY ticker, period, quarter;

CREATE OR REPLACE VIEW public.api_latest_financials_canonical_forecast AS
WITH ranked AS (
    SELECT cf.*,
        ROW_NUMBER() OVER (
            PARTITION BY cf.ticker, cf.period, cf.quarter, cf.metric
            ORDER BY cf.source_priority, cf.recency_key DESC
        ) AS rn
    FROM public.canonical_financials AS cf
    WHERE cf.source IN (
        'jquants_nxf', 'jquants_forecast_fy',
        'jquants_forecast_next_fy', 'jquants_forecast', 'tdnet_forecast'
    )
), filtered AS (
    SELECT * FROM ranked WHERE rn = 1
)
SELECT
    ticker, period, quarter,
    MAX(value) FILTER (WHERE metric = 'sales') AS sales,
    MAX(value) FILTER (WHERE metric = 'gross_profit') AS gross_profit,
    MAX(value) FILTER (WHERE metric = 'operating_profit') AS operating_profit,
    MAX(value) FILTER (WHERE metric = 'ordinary_profit') AS ordinary_profit,
    MAX(value) FILTER (WHERE metric = 'net_income') AS net_income,
    MAX(value) FILTER (WHERE metric = 'eps') AS eps,
    COALESCE(MAX(source) FILTER (WHERE metric = 'sales'), MAX(source)) AS source,
    MAX(updated_at) AS updated_at,
    MAX(value) FILTER (WHERE metric = 'profit_before_tax') AS profit_before_tax
FROM filtered
GROUP BY ticker, period, quarter;

GRANT SELECT ON public.api_latest_financials_canonical TO anon, authenticated, service_role;
GRANT SELECT ON public.api_latest_financials_canonical_forecast TO anon, authenticated, service_role;

COMMIT;
