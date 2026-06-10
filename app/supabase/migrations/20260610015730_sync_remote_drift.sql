
create type "public"."asset_type" as enum ('korean_stock', 'us_stock', 'crypto');

create type "public"."trade_type" as enum ('buy', 'sell');


  create table "public"."asset_prices" (
    "id" uuid not null default gen_random_uuid(),
    "ticker" text not null,
    "asset_type" text not null,
    "price" numeric not null,
    "currency" text not null,
    "fetched_at" timestamp with time zone not null default now()
      );


alter table "public"."asset_prices" enable row level security;


  create table "public"."exchange_rates" (
    "id" uuid not null default gen_random_uuid(),
    "from_currency" text not null,
    "to_currency" text not null,
    "rate" numeric not null,
    "fetched_at" timestamp with time zone not null default now()
      );


alter table "public"."exchange_rates" enable row level security;


  create table "public"."price_cache" (
    "id" uuid not null default gen_random_uuid(),
    "asset_type" public.asset_type not null,
    "ticker" text not null,
    "price" numeric not null,
    "currency" text not null,
    "fetched_at" timestamp with time zone not null default now()
      );


alter table "public"."price_cache" enable row level security;

CREATE UNIQUE INDEX asset_prices_pkey ON public.asset_prices USING btree (id);

CREATE UNIQUE INDEX exchange_rates_pkey ON public.exchange_rates USING btree (id);

CREATE INDEX idx_asset_prices_asset_type ON public.asset_prices USING btree (asset_type);

CREATE INDEX idx_asset_prices_ticker ON public.asset_prices USING btree (ticker);

CREATE INDEX idx_asset_prices_ticker_fetched_at ON public.asset_prices USING btree (ticker, fetched_at DESC);

CREATE INDEX idx_exchange_rates_from_to ON public.exchange_rates USING btree (from_currency, to_currency);

CREATE INDEX idx_exchange_rates_from_to_fetched_at ON public.exchange_rates USING btree (from_currency, to_currency, fetched_at DESC);

CREATE INDEX idx_exchange_rates_pair_fetched ON public.exchange_rates USING btree (from_currency, to_currency, fetched_at DESC);

CREATE INDEX idx_price_cache_ticker_asset_fetched ON public.price_cache USING btree (ticker, asset_type, fetched_at DESC);

CREATE UNIQUE INDEX price_cache_pkey ON public.price_cache USING btree (id);

CREATE UNIQUE INDEX uq_asset_prices_ticker_fetched_at ON public.asset_prices USING btree (ticker, fetched_at);

alter table "public"."asset_prices" add constraint "asset_prices_pkey" PRIMARY KEY using index "asset_prices_pkey";

alter table "public"."exchange_rates" add constraint "exchange_rates_pkey" PRIMARY KEY using index "exchange_rates_pkey";

alter table "public"."price_cache" add constraint "price_cache_pkey" PRIMARY KEY using index "price_cache_pkey";

alter table "public"."asset_prices" add constraint "asset_prices_asset_type_check" CHECK ((asset_type = ANY (ARRAY['korean_stock'::text, 'us_stock'::text, 'crypto'::text]))) not valid;

alter table "public"."asset_prices" validate constraint "asset_prices_asset_type_check";

alter table "public"."asset_prices" add constraint "asset_prices_price_check" CHECK ((price >= (0)::numeric)) not valid;

alter table "public"."asset_prices" validate constraint "asset_prices_price_check";

alter table "public"."asset_prices" add constraint "uq_asset_prices_ticker_fetched_at" UNIQUE using index "uq_asset_prices_ticker_fetched_at";

alter table "public"."exchange_rates" add constraint "exchange_rates_rate_check" CHECK ((rate > (0)::numeric)) not valid;

alter table "public"."exchange_rates" validate constraint "exchange_rates_rate_check";

alter table "public"."price_cache" add constraint "price_cache_price_check" CHECK ((price >= (0)::numeric)) not valid;

alter table "public"."price_cache" validate constraint "price_cache_price_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_holdings(p_asset_type text DEFAULT NULL::text)
 RETURNS TABLE(ticker text, name text, asset_type text, quantity numeric, avg_buy_price numeric, avg_buy_currency text, current_price numeric, current_price_currency text, current_price_fetched_at timestamp with time zone, evaluated_amount_krw numeric, invested_amount_krw numeric, profit_loss_krw numeric, return_rate numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  with
  -- 최신 USD→KRW 환율
  latest_usd_krw as (
    select rate
    from public.exchange_rates
    where from_currency = 'USD' and to_currency = 'KRW'
    order by fetched_at desc
    limit 1
  ),

  -- 보유 종목 집계: ticker별 순수 보유 수량 및 가중평균 매수가
  holdings_agg as (
    select
      te.ticker,
      te.asset_type,
      max(te.name) as name,
      -- 순 보유 수량 (매수 - 매도)
      sum(case when te.trade_type = 'buy' then te.quantity else -te.quantity end) as net_quantity,
      -- 가중평균 매수가: 매수 이벤트 기준
      case
        when sum(case when te.trade_type = 'buy' then te.quantity else 0 end) > 0
        then sum(case when te.trade_type = 'buy' then te.price_per_unit * te.quantity else 0 end)
             / sum(case when te.trade_type = 'buy' then te.quantity else 0 end)
        else 0
      end as avg_buy_price,
      max(case when te.trade_type = 'buy' then te.currency else null end) as avg_buy_currency
    from public.trade_events te
    where te.user_id = auth.uid()
      and (p_asset_type is null or te.asset_type::text = p_asset_type)
    group by te.ticker, te.asset_type
    having sum(case when te.trade_type = 'buy' then te.quantity else -te.quantity end) > 0
  ),

  -- ticker별 최신 현재가
  latest_prices as (
    select distinct on (ticker)
      ticker,
      price,
      currency,
      fetched_at
    from public.asset_prices
    order by ticker, fetched_at desc
  )

  select
    ha.ticker,
    ha.name,
    ha.asset_type::text,
    ha.net_quantity                                        as quantity,
    ha.avg_buy_price,
    ha.avg_buy_currency,
    lp.price                                               as current_price,
    lp.currency                                            as current_price_currency,
    lp.fetched_at                                          as current_price_fetched_at,
    -- 평가금액 (원화): USD 자산은 환율 적용
    case
      when lp.price is null then null
      when lp.currency = 'KRW' then lp.price * ha.net_quantity
      when lp.currency = 'USD' then lp.price * ha.net_quantity * (select rate from latest_usd_krw)
      else lp.price * ha.net_quantity  -- 코인 등 기타: 원화 직접 표기
    end                                                    as evaluated_amount_krw,
    -- 투입 원금 (원화): 매수가 기준 환산
    case
      when ha.avg_buy_currency = 'KRW' then ha.avg_buy_price * ha.net_quantity
      when ha.avg_buy_currency = 'USD' then ha.avg_buy_price * ha.net_quantity * (select rate from latest_usd_krw)
      else ha.avg_buy_price * ha.net_quantity
    end                                                    as invested_amount_krw,
    -- 평가손익 (원화)
    case
      when lp.price is null then null
      else (
        case
          when lp.currency = 'KRW' then lp.price * ha.net_quantity
          when lp.currency = 'USD' then lp.price * ha.net_quantity * (select rate from latest_usd_krw)
          else lp.price * ha.net_quantity
        end
      ) - (
        case
          when ha.avg_buy_currency = 'KRW' then ha.avg_buy_price * ha.net_quantity
          when ha.avg_buy_currency = 'USD' then ha.avg_buy_price * ha.net_quantity * (select rate from latest_usd_krw)
          else ha.avg_buy_price * ha.net_quantity
        end
      )
    end                                                    as profit_loss_krw,
    -- 수익률 (%)
    case
      when lp.price is null then null
      when ha.avg_buy_price = 0 then null
      else (lp.price - ha.avg_buy_price) / ha.avg_buy_price * 100
    end                                                    as return_rate
  from holdings_agg ha
  left join latest_prices lp on lp.ticker = ha.ticker
  order by ha.ticker;
$function$
;

CREATE OR REPLACE FUNCTION public.get_portfolio_history(p_user_id uuid, p_period text, p_asset_type public.asset_type DEFAULT NULL::public.asset_type)
 RETURNS TABLE(period_label text, total_assets numeric, total_invested numeric, total_fee_tax numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_trunc_unit text;
  v_fmt        text;
BEGIN
  IF p_period NOT IN ('day', 'week', 'month', 'year') THEN
    RAISE EXCEPTION 'Invalid p_period value: %. Must be day, week, month, or year.', p_period;
  END IF;

  -- date_trunc 단위 및 레이블 포맷 결정
  CASE p_period
    WHEN 'day'   THEN v_trunc_unit := 'hour';  v_fmt := 'HH24:MI';
    WHEN 'week'  THEN v_trunc_unit := 'day';   v_fmt := 'Dy';
    WHEN 'month' THEN v_trunc_unit := 'day';   v_fmt := 'DD';
    WHEN 'year'  THEN v_trunc_unit := 'month'; v_fmt := 'Mon';
  END CASE;

  RETURN QUERY
  WITH grouped AS (
    SELECT
      date_trunc(v_trunc_unit, te.trade_date::timestamptz) AS bucket,
      SUM(ABS(te.settlement_amount))                        AS period_assets,
      SUM(CASE WHEN te.trade_type = 'buy' THEN ABS(te.settlement_amount) ELSE 0 END) AS period_invested,
      SUM(te.fee + te.tax)                                  AS period_fee_tax
    FROM trade_events te
    WHERE
      te.user_id = p_user_id
      AND (p_asset_type IS NULL OR te.asset_type = p_asset_type)
    GROUP BY bucket
  )
  SELECT
    to_char(g.bucket, v_fmt)                                          AS period_label,
    SUM(g.period_assets)   OVER (ORDER BY g.bucket)                   AS total_assets,
    SUM(g.period_invested) OVER (ORDER BY g.bucket)                   AS total_invested,
    SUM(g.period_fee_tax)  OVER (ORDER BY g.bucket)                   AS total_fee_tax
  FROM grouped g
  ORDER BY g.bucket;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_positions(p_user_id uuid, p_asset_type public.asset_type DEFAULT NULL::public.asset_type)
 RETURNS TABLE(asset_type public.asset_type, ticker text, name text, quantity numeric, avg_buy_price numeric, currency text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    te.asset_type,
    te.ticker,
    MAX(te.name)                                          AS name,
    SUM(
      CASE te.trade_type
        WHEN 'buy'  THEN  te.quantity
        WHEN 'sell' THEN -te.quantity
      END
    )                                                     AS quantity,
    -- 가중평균 매수가: 매수 체결금액 합계 / 매수 수량 합계
    CASE
      WHEN SUM(CASE WHEN te.trade_type = 'buy' THEN te.quantity ELSE 0 END) = 0
        THEN 0
      ELSE
        SUM(CASE WHEN te.trade_type = 'buy' THEN te.quantity * te.price_per_unit ELSE 0 END)
        / SUM(CASE WHEN te.trade_type = 'buy' THEN te.quantity ELSE 0 END)
    END                                                   AS avg_buy_price,
    MAX(te.currency)                                      AS currency
  FROM trade_events te
  WHERE
    te.user_id = p_user_id
    AND (p_asset_type IS NULL OR te.asset_type = p_asset_type)
  GROUP BY te.asset_type, te.ticker
  HAVING
    SUM(
      CASE te.trade_type
        WHEN 'buy'  THEN  te.quantity
        WHEN 'sell' THEN -te.quantity
      END
    ) > 0;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ping()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
AS $function$                                                                  
    SELECT 'pong'::text;                                                                                                
  $function$
;

grant delete on table "public"."asset_prices" to "anon";

grant insert on table "public"."asset_prices" to "anon";

grant references on table "public"."asset_prices" to "anon";

grant select on table "public"."asset_prices" to "anon";

grant trigger on table "public"."asset_prices" to "anon";

grant truncate on table "public"."asset_prices" to "anon";

grant update on table "public"."asset_prices" to "anon";

grant delete on table "public"."asset_prices" to "authenticated";

grant insert on table "public"."asset_prices" to "authenticated";

grant references on table "public"."asset_prices" to "authenticated";

grant select on table "public"."asset_prices" to "authenticated";

grant trigger on table "public"."asset_prices" to "authenticated";

grant truncate on table "public"."asset_prices" to "authenticated";

grant update on table "public"."asset_prices" to "authenticated";

grant delete on table "public"."asset_prices" to "service_role";

grant insert on table "public"."asset_prices" to "service_role";

grant references on table "public"."asset_prices" to "service_role";

grant select on table "public"."asset_prices" to "service_role";

grant trigger on table "public"."asset_prices" to "service_role";

grant truncate on table "public"."asset_prices" to "service_role";

grant update on table "public"."asset_prices" to "service_role";

grant delete on table "public"."exchange_rates" to "anon";

grant insert on table "public"."exchange_rates" to "anon";

grant references on table "public"."exchange_rates" to "anon";

grant select on table "public"."exchange_rates" to "anon";

grant trigger on table "public"."exchange_rates" to "anon";

grant truncate on table "public"."exchange_rates" to "anon";

grant update on table "public"."exchange_rates" to "anon";

grant delete on table "public"."exchange_rates" to "authenticated";

grant insert on table "public"."exchange_rates" to "authenticated";

grant references on table "public"."exchange_rates" to "authenticated";

grant select on table "public"."exchange_rates" to "authenticated";

grant trigger on table "public"."exchange_rates" to "authenticated";

grant truncate on table "public"."exchange_rates" to "authenticated";

grant update on table "public"."exchange_rates" to "authenticated";

grant delete on table "public"."exchange_rates" to "service_role";

grant insert on table "public"."exchange_rates" to "service_role";

grant references on table "public"."exchange_rates" to "service_role";

grant select on table "public"."exchange_rates" to "service_role";

grant trigger on table "public"."exchange_rates" to "service_role";

grant truncate on table "public"."exchange_rates" to "service_role";

grant update on table "public"."exchange_rates" to "service_role";

grant delete on table "public"."price_cache" to "anon";

grant insert on table "public"."price_cache" to "anon";

grant references on table "public"."price_cache" to "anon";

grant select on table "public"."price_cache" to "anon";

grant trigger on table "public"."price_cache" to "anon";

grant truncate on table "public"."price_cache" to "anon";

grant update on table "public"."price_cache" to "anon";

grant delete on table "public"."price_cache" to "authenticated";

grant insert on table "public"."price_cache" to "authenticated";

grant references on table "public"."price_cache" to "authenticated";

grant select on table "public"."price_cache" to "authenticated";

grant trigger on table "public"."price_cache" to "authenticated";

grant truncate on table "public"."price_cache" to "authenticated";

grant update on table "public"."price_cache" to "authenticated";

grant delete on table "public"."price_cache" to "service_role";

grant insert on table "public"."price_cache" to "service_role";

grant references on table "public"."price_cache" to "service_role";

grant select on table "public"."price_cache" to "service_role";

grant trigger on table "public"."price_cache" to "service_role";

grant truncate on table "public"."price_cache" to "service_role";

grant update on table "public"."price_cache" to "service_role";


  create policy "asset_prices_select_authenticated"
  on "public"."asset_prices"
  as permissive
  for select
  to authenticated
using (true);



  create policy "exchange_rates_delete_service_only"
  on "public"."exchange_rates"
  as permissive
  for delete
  to public
using (false);



  create policy "exchange_rates_insert_service_only"
  on "public"."exchange_rates"
  as permissive
  for insert
  to public
with check (false);



  create policy "exchange_rates_select_authenticated"
  on "public"."exchange_rates"
  as permissive
  for select
  to authenticated
using (true);



  create policy "exchange_rates_update_service_only"
  on "public"."exchange_rates"
  as permissive
  for update
  to public
using (false);



  create policy "price_cache_delete_service_only"
  on "public"."price_cache"
  as permissive
  for delete
  to public
using (false);



  create policy "price_cache_insert_service_only"
  on "public"."price_cache"
  as permissive
  for insert
  to public
with check (false);



  create policy "price_cache_select_authenticated"
  on "public"."price_cache"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "price_cache_update_service_only"
  on "public"."price_cache"
  as permissive
  for update
  to public
using (false);



