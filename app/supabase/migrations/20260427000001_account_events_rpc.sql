-- [007] AccountEvents RPC 함수
-- get_kpi_summary: KPI 집계 (총 평가액/원금/순수익/수익률/예수금/누적 배당·수수료·세금 + holdings)
-- get_history_markers: 히스토리 이벤트 마커 (배당/출금)

-- ────────────────────────────────────────────
-- 기존 함수 제거 (시그니처 변경 시 replace 불가)
-- ────────────────────────────────────────────

drop function if exists public.get_kpi_summary(text, jsonb, numeric);
drop function if exists public.get_history_markers(date, date);

-- ────────────────────────────────────────────
-- get_kpi_summary
-- ────────────────────────────────────────────
-- p_asset_type: null이면 전체, 아니면 해당 부문만
-- p_current_prices: [{"ticker":"AAPL","asset_type":"us_stock","price":195.5,"currency":"USD"}, ...]
-- p_fx_rate_usd: 현재 USD/KRW 환율 (> 0)

create or replace function public.get_kpi_summary(
  p_asset_type      text    default null,
  p_current_prices  jsonb   default '[]'::jsonb,
  p_fx_rate_usd     numeric default 1300
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id           uuid := auth.uid();
  v_principal_krw     numeric := 0;
  v_cash_krw          numeric := 0;
  v_cash_usd          numeric := 0;
  v_cum_dividend_krw  numeric := 0;
  v_cum_fee_krw       numeric := 0;
  v_cum_tax_krw       numeric := 0;
  v_holdings_value_krw numeric := 0;
  v_total_value_krw   numeric := 0;
  v_net_profit_krw    numeric := 0;
  v_return_rate_pct   numeric := 0;
  v_holdings          jsonb   := '[]'::jsonb;
  r_price             record;
  r_holding           record;
  v_price             numeric;
  v_price_currency    text;
  v_holding_value_krw numeric;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if p_fx_rate_usd <= 0 then
    raise exception 'p_fx_rate_usd must be greater than 0' using errcode = '22023';
  end if;

  -- ── 원금 계산: 입금 합계 − 출금 합계 (KRW 환산)
  select
    coalesce(sum(
      case
        when ae.event_type = 'deposit' then
          case
            when ae.currency = 'KRW' then ae.amount
            when ae.currency = 'USD' then ae.amount * coalesce(ae.fx_rate_at_event, p_fx_rate_usd)
            else 0
          end
        when ae.event_type = 'withdraw' then
          -1 * case
            when ae.currency = 'KRW' then ae.amount
            when ae.currency = 'USD' then ae.amount * coalesce(ae.fx_rate_at_event, p_fx_rate_usd)
            else 0
          end
        else 0
      end
    ), 0)
  into v_principal_krw
  from public.account_events ae
  where ae.user_id = v_user_id;

  -- ── 예수금 계산: 입금 − 출금 − (매수 지출) + 매도 수입 + 배당
  --    KRW 예수금
  select
    coalesce(sum(
      case ae.event_type
        when 'deposit'  then (case when ae.currency = 'KRW' then ae.amount else 0 end)
        when 'withdraw' then -(case when ae.currency = 'KRW' then ae.amount else 0 end)
        when 'buy'      then -(case when ae.currency = 'KRW' then ae.amount else 0 end)
        when 'sell'     then (case when ae.currency = 'KRW' then ae.amount else 0 end)
        when 'dividend' then (case when ae.currency = 'KRW' then ae.amount - ae.tax else 0 end)
        else 0
      end
    ), 0)
  into v_cash_krw
  from public.account_events ae
  where ae.user_id = v_user_id;

  -- USD 예수금
  select
    coalesce(sum(
      case ae.event_type
        when 'deposit'  then (case when ae.currency = 'USD' then ae.amount else 0 end)
        when 'withdraw' then -(case when ae.currency = 'USD' then ae.amount else 0 end)
        when 'buy'      then -(case when ae.currency = 'USD' then ae.amount else 0 end)
        when 'sell'     then (case when ae.currency = 'USD' then ae.amount else 0 end)
        when 'dividend' then (case when ae.currency = 'USD' then ae.amount - ae.tax else 0 end)
        else 0
      end
    ), 0)
  into v_cash_usd
  from public.account_events ae
  where ae.user_id = v_user_id;

  -- ── 누적 배당금 (KRW 환산, 세후)
  select
    coalesce(sum(
      case
        when ae.currency = 'KRW' then ae.amount - ae.tax
        when ae.currency = 'USD' then (ae.amount - ae.tax) * coalesce(ae.fx_rate_at_event, p_fx_rate_usd)
        else 0
      end
    ), 0)
  into v_cum_dividend_krw
  from public.account_events ae
  where ae.user_id = v_user_id and ae.event_type = 'dividend';

  -- ── 누적 수수료 (KRW 환산)
  select
    coalesce(sum(
      case
        when ae.currency = 'KRW' then ae.fee
        when ae.currency = 'USD' then ae.fee * coalesce(ae.fx_rate_at_event, p_fx_rate_usd)
        else 0
      end
    ), 0)
  into v_cum_fee_krw
  from public.account_events ae
  where ae.user_id = v_user_id;

  -- ── 누적 세금 (KRW 환산)
  select
    coalesce(sum(
      case
        when ae.currency = 'KRW' then ae.tax
        when ae.currency = 'USD' then ae.tax * coalesce(ae.fx_rate_at_event, p_fx_rate_usd)
        else 0
      end
    ), 0)
  into v_cum_tax_krw
  from public.account_events ae
  where ae.user_id = v_user_id;

  -- ── 보유 종목별 집계 (수량, 평균매수가)
  --    corporate_actions 반영: effective_date 이후 ratio로 수량 조정
  for r_holding in
    with recursive buy_sell as (
      select
        ae.ticker,
        ae.name,
        ae.asset_type,
        ae.currency,
        ae.event_type,
        ae.quantity,
        ae.price_per_unit,
        ae.fee,
        ae.tax,
        ae.event_date,
        ae.created_at,
        row_number() over (partition by ae.ticker order by ae.event_date, ae.created_at) as rn
      from public.account_events ae
      where ae.user_id = v_user_id
        and ae.event_type in ('buy', 'sell')
        and ae.ticker is not null
        and (p_asset_type is null or ae.asset_type = p_asset_type)
    ),
    running as (
      -- 기저 케이스
      select
        ticker, name, asset_type, currency,
        event_type, quantity, price_per_unit, fee, tax, rn,
        case when event_type = 'buy' then quantity else 0 end as cum_qty,
        case when event_type = 'buy' then price_per_unit else 0 end as cum_avg
      from buy_sell where rn = 1

      union all

      -- 재귀 케이스
      select
        bs.ticker, bs.name, bs.asset_type, bs.currency,
        bs.event_type, bs.quantity, bs.price_per_unit, bs.fee, bs.tax, bs.rn,
        case
          when bs.event_type = 'buy'  then r.cum_qty + bs.quantity
          else greatest(r.cum_qty - bs.quantity, 0)
        end as cum_qty,
        case
          when bs.event_type = 'buy' then
            case
              when r.cum_qty = 0 then bs.price_per_unit
              else (r.cum_qty * r.cum_avg + bs.quantity * bs.price_per_unit)
                   / (r.cum_qty + bs.quantity)
            end
          else r.cum_avg
        end as cum_avg
      from running r
      join buy_sell bs on bs.ticker = r.ticker and bs.rn = r.rn + 1
    ),
    latest as (
      select distinct on (ticker)
        ticker, name, asset_type, currency, cum_qty, cum_avg
      from running
      order by ticker, rn desc
    ),
    totals as (
      select
        bs.ticker,
        sum(bs.fee) as total_fee,
        sum(bs.tax) as total_tax
      from buy_sell bs
      group by bs.ticker
    ),
    -- corporate_actions 적용: effective_date 이후 ratio 곱
    adjusted as (
      select
        l.ticker,
        l.name,
        l.asset_type,
        l.currency,
        l.cum_qty * coalesce(
          (select exp(sum(ln(ca.ratio)))
           from public.corporate_actions ca
           where ca.ticker = l.ticker
             and ca.asset_type = l.asset_type
             and ca.action_type in ('split', 'dividend_stock')
          ), 1
        ) as adjusted_qty,
        l.cum_avg / coalesce(
          (select exp(sum(ln(ca.ratio)))
           from public.corporate_actions ca
           where ca.ticker = l.ticker
             and ca.asset_type = l.asset_type
             and ca.action_type in ('split', 'dividend_stock')
          ), 1
        ) as adjusted_avg,
        t.total_fee,
        t.total_tax
      from latest l
      left join totals t on t.ticker = l.ticker
      where l.cum_qty > 0
    )
    select * from adjusted
  loop
    -- 현재가 탐색 (p_current_prices 배열에서)
    v_price          := null;
    v_price_currency := r_holding.currency;

    for r_price in select value from jsonb_array_elements(p_current_prices)
    loop
      if (r_price.value->>'ticker') = r_holding.ticker
         and (r_price.value->>'asset_type') = r_holding.asset_type then
        v_price          := (r_price.value->>'price')::numeric;
        v_price_currency := (r_price.value->>'currency');
        exit;
      end if;
    end loop;

    -- 종목 평가액 → KRW 환산
    if v_price is not null then
      if v_price_currency = 'KRW' then
        v_holding_value_krw := r_holding.adjusted_qty * v_price;
      else
        v_holding_value_krw := r_holding.adjusted_qty * v_price * p_fx_rate_usd;
      end if;
      v_holdings_value_krw := v_holdings_value_krw + v_holding_value_krw;
    end if;

    v_holdings := v_holdings || jsonb_build_object(
      'ticker',        r_holding.ticker,
      'name',          r_holding.name,
      'asset_type',    r_holding.asset_type,
      'quantity',      r_holding.adjusted_qty,
      'avg_buy_price', r_holding.adjusted_avg,
      'currency',      r_holding.currency,
      'total_fee',     coalesce(r_holding.total_fee, 0),
      'total_tax',     coalesce(r_holding.total_tax, 0)
    );
  end loop;

  -- ── 총 평가액 = 종목 평가액 + KRW 예수금 + USD 예수금(환산)
  v_total_value_krw := v_holdings_value_krw
                     + v_cash_krw
                     + (v_cash_usd * p_fx_rate_usd);

  -- ── 순수익, 수익률
  v_net_profit_krw  := v_total_value_krw - v_principal_krw;
  v_return_rate_pct := case
    when v_principal_krw > 0 then (v_net_profit_krw / v_principal_krw) * 100
    else 0
  end;

  return jsonb_build_object(
    'total_value_krw',        v_total_value_krw,
    'principal_krw',          v_principal_krw,
    'net_profit_krw',         v_net_profit_krw,
    'return_rate_pct',        v_return_rate_pct,
    'cash', jsonb_build_object(
      'krw',       v_cash_krw,
      'usd',       v_cash_usd,
      'total_krw', v_cash_krw + (v_cash_usd * p_fx_rate_usd)
    ),
    'cumulative_dividend_krw', v_cum_dividend_krw,
    'cumulative_fee_krw',      v_cum_fee_krw,
    'cumulative_tax_krw',      v_cum_tax_krw,
    'holdings',                v_holdings
  );
end;
$$;

-- ────────────────────────────────────────────
-- get_history_markers
-- ────────────────────────────────────────────
-- p_from / p_to: 기간 필터 (YYYY-MM-DD)
-- 반환: 배당/출금 이벤트 마커 목록 (KRW 환산)

create or replace function public.get_history_markers(
  p_from date,
  p_to   date
)
returns table (
  event_date  date,
  event_type  text,
  amount_krw  numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select
    ae.event_date,
    ae.event_type,
    -- KRW 환산: fx_rate_at_event 우선, 없으면 당일 fx_rates 조회
    case
      when ae.currency = 'KRW' then ae.amount
      when ae.currency = 'USD' then
        ae.amount * coalesce(
          ae.fx_rate_at_event,
          (select fr.usd_krw from public.fx_rates fr where fr.date = ae.event_date),
          1300  -- fallback
        )
      else ae.amount  -- 기타 통화: 그대로 사용
    end as amount_krw
  from public.account_events ae
  where ae.user_id = v_user_id
    and ae.event_type in ('dividend', 'withdraw')
    and ae.event_date >= p_from
    and ae.event_date <= p_to
  order by ae.event_date;
end;
$$;
