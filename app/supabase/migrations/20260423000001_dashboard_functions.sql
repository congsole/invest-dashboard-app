-- [004] 대시보드 집계 DB Function
-- Cycle 3 수정: trade_events.asset_type, trade_type이 enum 타입으로 존재하므로
-- 비교 시 ::text 캐스팅 필요. get_sector_allocation은 returns table 컬럼명과
-- 쿼리 컬럼명 충돌(ambiguous) 방지를 위해 내부 별칭 사용.

-- 기존 함수 삭제 (반환 타입 변경 시 create or replace 불가)
drop function if exists public.get_portfolio_summary(text);
drop function if exists public.get_asset_history(text, text);
drop function if exists public.get_sector_allocation();

-- ────────────────────────────────────────────
-- get_portfolio_summary
-- 보유 종목별 수량, 가중평균 매수가, 투입 원금, 수수료, 세금 집계
-- p_asset_type NULL이면 전체 부문 반환
-- ────────────────────────────────────────────

create or replace function public.get_portfolio_summary(
  p_asset_type text default null
)
returns table (
  ticker        text,
  name          text,
  asset_type    text,
  quantity      numeric,
  avg_buy_price numeric,
  currency      text,
  total_invested numeric,
  total_fee      numeric,
  total_tax      numeric
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
  with events as (
    -- trade_events.asset_type, trade_type은 enum 타입 → ::text 캐스팅 후 사용
    select
      te.ticker,
      te.name,
      te.asset_type::text as at,
      te.trade_type::text as tt,
      te.quantity,
      te.price_per_unit,
      te.currency,
      te.fee,
      te.tax,
      te.settlement_amount,
      te.trade_date,
      te.created_at
    from public.trade_events te
    where te.user_id = v_user_id
      and (p_asset_type is null or te.asset_type::text = p_asset_type)
  ),
  -- 종목별 순서대로 평단가를 계산한다 (매수 시 가중평균 갱신, 매도 시 불변, 전량 매도 후 재매수 시 새로 계산)
  ordered_events as (
    select
      *,
      row_number() over (partition by ticker order by trade_date, created_at) as rn
    from events
  ),
  -- 종목별 누적 집계 (재귀 CTE로 평단가 유지)
  running as (
    -- 기저 케이스: 각 ticker의 첫 번째 이벤트
    select
      ticker,
      name,
      at,
      currency,
      tt,
      quantity,
      price_per_unit,
      fee,
      tax,
      settlement_amount,
      rn,
      -- 첫 이벤트: 매수면 수량과 평단가 설정, 매도면 0
      case when tt = 'buy' then quantity else 0 end as cum_quantity,
      case when tt = 'buy' then price_per_unit else 0 end as cum_avg_price,
      case when tt = 'buy' then quantity * price_per_unit else 0 end as cum_invested_base
    from ordered_events
    where rn = 1

    union all

    -- 재귀 케이스: 이전 상태를 바탕으로 현재 이벤트 처리
    select
      oe.ticker,
      oe.name,
      oe.at,
      oe.currency,
      oe.tt,
      oe.quantity,
      oe.price_per_unit,
      oe.fee,
      oe.tax,
      oe.settlement_amount,
      oe.rn,
      -- 수량 갱신: 매수면 더하고, 매도면 빼되 0 미만 방지
      case
        when oe.tt = 'buy' then r.cum_quantity + oe.quantity
        else greatest(r.cum_quantity - oe.quantity, 0)
      end as cum_quantity,
      -- 평단가 갱신 규칙:
      --   매수: 전량 매도 후 재매수(r.cum_quantity=0)이면 새 가격, 아니면 가중평균
      --   매도: 평단가 불변
      case
        when oe.tt = 'buy' then
          case
            when r.cum_quantity = 0 then oe.price_per_unit
            else (r.cum_quantity * r.cum_avg_price + oe.quantity * oe.price_per_unit)
                 / (r.cum_quantity + oe.quantity)
          end
        else r.cum_avg_price
      end as cum_avg_price,
      -- 투입 원금 누적
      r.cum_invested_base + (oe.quantity * oe.price_per_unit * case when oe.tt = 'buy' then 1 else 0 end)
    from running r
    join ordered_events oe on oe.ticker = r.ticker and oe.rn = r.rn + 1
  ),
  -- 각 ticker의 최종 상태 (가장 최근 rn)
  final_state as (
    select distinct on (ticker)
      ticker,
      name,
      at,
      currency,
      cum_quantity,
      cum_avg_price
    from running
    order by ticker, rn desc
  ),
  -- 종목별 총 수수료, 세금, settlement_amount 합산
  totals as (
    select
      e.ticker,
      sum(e.fee) as total_fee,
      sum(e.tax) as total_tax,
      sum(abs(e.settlement_amount) * case when e.tt = 'buy' then 1 else -1 end) as total_invested
    from events e
    group by e.ticker
  )
  select
    fs.ticker,
    fs.name,
    fs.at as asset_type,
    fs.cum_quantity as quantity,
    fs.cum_avg_price as avg_buy_price,
    fs.currency,
    t.total_invested,
    t.total_fee,
    t.total_tax
  from final_state fs
  join totals t on t.ticker = fs.ticker
  where fs.cum_quantity > 0  -- 전량 매도된 종목 제외
  order by fs.at, fs.ticker;
end;
$$;

-- ────────────────────────────────────────────
-- get_asset_history
-- 기간 단위별 누적 투입 원금 및 수수료+세금 집계
-- p_period: 'day' | 'week' | 'month' | 'year'
-- p_asset_type NULL이면 전체
-- ────────────────────────────────────────────

create or replace function public.get_asset_history(
  p_period     text,
  p_asset_type text default null
)
returns table (
  bucket          text,
  total_invested  numeric,
  total_fee_tax   numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_trunc_unit text;
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  -- p_period 값 검증 및 date_trunc 단위 결정
  -- trade_date는 date 타입(시간 정보 없음)이므로 'hour' 버킷은 의미 없음.
  -- 'day' 기간도 'day' 단위로 버킷을 만들어 그래프 데이터를 반환한다.
  v_trunc_unit := case p_period
    when 'day'   then 'day'
    when 'week'  then 'day'
    when 'month' then 'day'
    when 'year'  then 'month'
    else null
  end;

  if v_trunc_unit is null then
    raise exception 'Invalid p_period value: %. Allowed: day, week, month, year', p_period
      using errcode = '22023';
  end if;

  return query
  with events as (
    select
      date_trunc(v_trunc_unit, trade_date::timestamptz) as time_bucket,
      abs(settlement_amount) * case when trade_type::text = 'buy' then 1 else -1 end as net_invested,
      fee + tax as fee_tax
    from public.trade_events
    where user_id = v_user_id
      and (p_asset_type is null or asset_type::text = p_asset_type)
      and (
        case p_period
          when 'day'   then trade_date >= current_date - interval '1 day'
          when 'week'  then trade_date >= current_date - interval '7 days'
          when 'month' then trade_date >= current_date - interval '30 days'
          when 'year'  then trade_date >= current_date - interval '365 days'
        end
      )
  ),
  bucketed as (
    select
      time_bucket,
      sum(net_invested) as period_invested,
      sum(fee_tax) as period_fee_tax
    from events
    group by time_bucket
    order by time_bucket
  )
  select
    to_char(b.time_bucket, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as bucket,
    sum(b.period_invested) over (order by b.time_bucket rows between unbounded preceding and current row) as total_invested,
    sum(b.period_fee_tax) over (order by b.time_bucket rows between unbounded preceding and current row) as total_fee_tax
  from bucketed b
  order by b.time_bucket;
end;
$$;

-- ────────────────────────────────────────────
-- get_sector_allocation
-- 보유 종목의 asset_type별 투입 원금 합계 및 종목 수 반환
-- ────────────────────────────────────────────

create or replace function public.get_sector_allocation()
returns table (
  asset_type     text,
  total_invested numeric,
  ticker_count   bigint
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
  with holding_tickers as (
    -- 현재 보유 중인 ticker만 추출 (수량 > 0)
    -- returns table의 asset_type 컬럼과 충돌하지 않도록 별칭 at_type 사용
    select
      te2.ticker,
      te2.asset_type::text as at_type,
      sum(te2.quantity * case when te2.trade_type::text = 'buy' then 1 else -1 end) as net_quantity
    from public.trade_events te2
    where te2.user_id = v_user_id
    group by te2.ticker, te2.asset_type
    having sum(te2.quantity * case when te2.trade_type::text = 'buy' then 1 else -1 end) > 0
  ),
  invested_by_ticker as (
    select
      te3.ticker,
      te3.asset_type::text as at_type,
      sum(abs(te3.settlement_amount) * case when te3.trade_type::text = 'buy' then 1 else -1 end) as total_invested
    from public.trade_events te3
    where te3.user_id = v_user_id
    group by te3.ticker, te3.asset_type
  )
  select
    ht.at_type::text as asset_type,
    sum(ibt.total_invested) as total_invested,
    count(distinct ht.ticker) as ticker_count
  from holding_tickers ht
  join invested_by_ticker ibt on ibt.ticker = ht.ticker and ibt.at_type = ht.at_type
  group by ht.at_type
  order by ht.at_type;
end;
$$;
