-- [028] 히스토리 그래프 개편 — get_history_markers 시그니처 변경

-- 기존 함수(p_from date, p_to date 파라미터 포함)를 명시적으로 DROP한다.
-- CREATE OR REPLACE는 파라미터 목록이 다르면 오버로드를 새로 만들어버리므로,
-- 구 시그니처를 먼저 제거하고 파라미터 없는 신규 함수를 재생성한다.
drop function if exists public.get_history_markers(date, date);

-- get_history_markers (파라미터 없음)
-- 호출 사용자의 배당 이벤트 마커만 반환한다.
-- 출금(withdraw) 마커는 이번 개편에서 제거되었다.
-- 날짜 범위 파라미터도 제거: 전체 기간을 반환하고 클라이언트가 집계 단위에 맞게 버킷팅한다.
create or replace function public.get_history_markers()
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
    and ae.event_type = 'dividend'
  order by ae.event_date;
end;
$$;
