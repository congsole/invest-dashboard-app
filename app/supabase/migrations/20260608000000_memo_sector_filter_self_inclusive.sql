-- [022] 메모 섹터 필터 — RPC 계층 탐색 규칙 수정 및 sectorIds 동작 변경
--
-- 변경 사항:
-- list_memos RPC의 직접 연결 경로(memo_sectors) 탐색 규칙을 명확히 확정:
--   - 기존(구 버전): memo_sectors.sector_id = any(p_sector_ids) — 지정된 섹터만 단순 매칭, 하위 탐색 없음
--   - 현재(올바른): 재귀 CTE로 지정된 섹터 자신 + 모든 하위 descendants를 집합으로 구성 후 매칭
--
-- 이 마이그레이션은 20260605000001에서 구현된 내용을 이슈 022 컨텍스트에서 명시적으로 재확정한다.
-- DB에 이미 올바른 함수가 존재하므로 동작 변경은 없으며, 히스토리 트레이서빌리티 목적이다.
--
-- 핵심 규칙 (sector_descendants CTE):
--   anchor:    p_sector_ids에 포함된 섹터 자신 (L1이면 L1 자신 포함)
--   recursive: 해당 섹터의 모든 하위 레벨 (L2, L3, L4 전부)
--
-- 결과:
--   p_sector_ids = [L1_id] 전달 시 →
--     종목 경로: stocks.sector_id가 L1~L4 어디든 L1 하위인 종목 연결 메모 포함
--     직접 경로: memo_sectors.sector_id가 L1 자신이거나 L2~L4 하위인 메모 모두 포함

-- ────────────────────────────────────────────
-- DROP existing list_memos before recreating
-- ────────────────────────────────────────────

drop function if exists public.list_memos(date, date, uuid[], boolean, boolean, int[], boolean, int, int);

-- ────────────────────────────────────────────
-- list_memos — 섹터 재귀 탐색 (자신 및 하위 레벨 포함) 확정
-- ────────────────────────────────────────────

create or replace function list_memos(
  p_from               date    default null,
  p_to                 date    default null,
  p_stock_ids          uuid[]  default null,   -- 복수 종목 OR 필터 (직접연결 + 매매이벤트 경유)
  p_trade_events_only  boolean default false,
  p_news_only          boolean default false,
  p_sector_ids         int[]   default null,   -- 복수 섹터 OR 필터 (재귀 CTE: 자신 및 하위 레벨)
  p_no_links           boolean default false,
  p_limit              int     default 20,
  p_offset             int     default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_memos   json;
  v_total   int;
begin
  -- 인증 확인
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  -- 파라미터 유효성 검사
  if p_limit > 100 then
    raise exception 'p_limit must be <= 100, got %', p_limit
      using errcode = 'check_violation';
  end if;

  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'p_from must be <= p_to'
      using errcode = 'check_violation';
  end if;

  -- 전체 카운트
  -- 섹터 필터는 재귀 CTE로 지정된 섹터 자신 + 모든 하위 sector_id 집합을 구한 뒤,
  -- 종목 경로(memo_stocks JOIN stocks) UNION 직접 연결 경로(memo_sectors)로 판단.
  -- anchor에 p_sector_ids 자신을 포함하므로 L1 id만 전달해도 L1에 직접 연결된 메모가 누락되지 않는다.
  with recursive sector_descendants as (
    -- anchor: 지정된 섹터 자신 포함 (L1 id가 있으면 L1 자신도 포함)
    select id from sectors where id = any(p_sector_ids)
    union all
    -- recursive: 하위 섹터 전체 탐색
    select s.id
      from sectors s
      join sector_descendants d on s.parent_id = d.id
  ),
  sector_memo_ids as (
    -- 종목 경로: 하위 섹터(자신 포함)에 속하는 종목과 연결된 메모
    select distinct ms.memo_id
      from memo_stocks ms
      join stocks st on st.id = ms.stock_id
     where st.sector_id in (select id from sector_descendants)
    union
    -- 직접 연결 경로: 해당 섹터 자신 및 하위 레벨에 직접 연결된 메모
    select distinct mse.memo_id
      from memo_sectors mse
     where mse.sector_id in (select id from sector_descendants)
  )
  select count(distinct m.id)
    into v_total
    from memos m
   where m.user_id = v_user_id
     -- 날짜 범위 필터
     and (p_from is null or m.created_at::date >= p_from)
     and (p_to   is null or m.created_at::date <= p_to)
     -- p_no_links: 다른 필터를 모두 무시하고 연결 없는 메모만 반환
     and (
       p_no_links = false
       or (
         not exists (select 1 from memo_stocks       ms  where ms.memo_id  = m.id)
         and not exists (select 1 from memo_trade_events mte where mte.memo_id = m.id)
         and not exists (select 1 from memo_news         mn  where mn.memo_id  = m.id)
         and not exists (select 1 from memo_sectors      mse where mse.memo_id = m.id)
       )
     )
     -- 종목 필터 (OR): 하나라도 연관된 메모 (직접연결 + 매매이벤트 경유 연결)
     and (
       p_no_links = true
       or p_stock_ids is null
       or cardinality(p_stock_ids) = 0
       or exists (
         select 1 from memo_stocks ms
          where ms.memo_id  = m.id
            and ms.stock_id = any(p_stock_ids)
       )
       or exists (
         select 1
           from memo_trade_events mte
           join account_events    ae on ae.id = mte.event_id
           join stocks            st on st.id = any(p_stock_ids)
                                    and st.ticker = ae.ticker
          where mte.memo_id = m.id
       )
     )
     -- 매매 연관 필터 (AND)
     and (
       p_no_links = true
       or p_trade_events_only = false
       or exists (select 1 from memo_trade_events mte where mte.memo_id = m.id)
     )
     -- 뉴스 연관 필터 (AND)
     and (
       p_no_links = true
       or p_news_only = false
       or exists (select 1 from memo_news mn where mn.memo_id = m.id)
     )
     -- 섹터 필터: 재귀 CTE로 자신 및 하위 레벨 전체 포함
     and (
       p_no_links = true
       or p_sector_ids is null
       or cardinality(p_sector_ids) = 0
       or m.id in (select memo_id from sector_memo_ids)
     );

  -- 메모 목록 조회 (섹터 필터는 카운트와 동일한 CTE 패턴 적용)
  with recursive sector_descendants as (
    select id from sectors where id = any(p_sector_ids)
    union all
    select s.id
      from sectors s
      join sector_descendants d on s.parent_id = d.id
  ),
  sector_memo_ids as (
    select distinct ms.memo_id
      from memo_stocks ms
      join stocks st on st.id = ms.stock_id
     where st.sector_id in (select id from sector_descendants)
    union
    select distinct mse.memo_id
      from memo_sectors mse
     where mse.sector_id in (select id from sector_descendants)
  )
  select coalesce(json_agg(row_data), '[]'::json)
    into v_memos
    from (
      select json_build_object(
        'id',           m.id,
        'body',         m.body,
        'created_at',   m.created_at,
        'updated_at',   m.updated_at,
        'stocks',       coalesce((
          select json_agg(json_build_object(
            'stock_id',   ms.stock_id,
            'ticker',     s.ticker,
            'name',       s.name,
            'market',     s.market,
            'goal_price', ms.goal_price
          ))
          from memo_stocks ms
          join stocks s on s.id = ms.stock_id
          where ms.memo_id = m.id
        ), '[]'::json),
        'trade_events', coalesce((
          select json_agg(json_build_object(
            'event_id',   mte.event_id,
            'event_type', ae.event_type,
            'event_date', ae.event_date,
            'ticker',     ae.ticker,
            'name',       ae.name
          ))
          from memo_trade_events mte
          join account_events ae on ae.id = mte.event_id
          where mte.memo_id = m.id
        ), '[]'::json),
        'news',         coalesce((
          select json_agg(json_build_object('news_id', mn.news_id))
          from memo_news mn
          where mn.memo_id = m.id
        ), '[]'::json),
        'sectors',      coalesce((
          select json_agg(json_build_object(
            'sector_id', mse.sector_id,
            'code',      se.code,
            'name',      se.name,
            'name_en',   se.name_en,
            'level',     se.level
          ))
          from memo_sectors mse
          join sectors se on se.id = mse.sector_id
          where mse.memo_id = m.id
        ), '[]'::json)
      ) as row_data
      from memos m
     where m.user_id = v_user_id
       and (p_from is null or m.created_at::date >= p_from)
       and (p_to   is null or m.created_at::date <= p_to)
       and (
         p_no_links = false
         or (
           not exists (select 1 from memo_stocks       ms  where ms.memo_id  = m.id)
           and not exists (select 1 from memo_trade_events mte where mte.memo_id = m.id)
           and not exists (select 1 from memo_news         mn  where mn.memo_id  = m.id)
           and not exists (select 1 from memo_sectors      mse where mse.memo_id = m.id)
         )
       )
       and (
         p_no_links = true
         or p_stock_ids is null
         or cardinality(p_stock_ids) = 0
         or exists (
           select 1 from memo_stocks ms
            where ms.memo_id  = m.id
              and ms.stock_id = any(p_stock_ids)
         )
         or exists (
           select 1
             from memo_trade_events mte
             join account_events    ae on ae.id = mte.event_id
             join stocks            st on st.id = any(p_stock_ids)
                                      and st.ticker = ae.ticker
            where mte.memo_id = m.id
         )
       )
       and (
         p_no_links = true
         or p_trade_events_only = false
         or exists (select 1 from memo_trade_events mte where mte.memo_id = m.id)
       )
       and (
         p_no_links = true
         or p_news_only = false
         or exists (select 1 from memo_news mn where mn.memo_id = m.id)
       )
       and (
         p_no_links = true
         or p_sector_ids is null
         or cardinality(p_sector_ids) = 0
         or m.id in (select memo_id from sector_memo_ids)
       )
     order by m.created_at desc
     limit  p_limit
     offset p_offset
  ) sub;

  return json_build_object(
    'memos',       v_memos,
    'total_count', v_total
  );
end;
$$;
