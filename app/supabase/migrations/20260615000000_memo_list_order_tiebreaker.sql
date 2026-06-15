-- list_memos: offset 페이지네이션 결정성 확보
--
-- 문제: order by m.created_at desc 단독은 created_at이 같은 메모가 있을 때
--       페이지 간 정렬이 비결정적이라, offset 경계에서 같은 행이 두 페이지에
--       걸쳐 반환될 수 있다 (FlatList 중복 키 경고의 근본 원인).
-- 해결: 유일 컬럼 m.id를 타이브레이커로 추가하여 결정적 정렬을 보장한다.
--
-- 본문은 20260610020000_fix_memo_rpc_name_en.sql의 list_memos와 동일하며
-- order by 절만 변경했다.

create or replace function list_memos(
  p_from               date    default null,
  p_to                 date    default null,
  p_stock_ids          uuid[]  default null,   -- 복수 종목 OR 필터 (직접연결 + 매매이벤트 경유)
  p_trade_events_only  boolean default false,
  p_news_only          boolean default false,
  p_sector_ids         int[]   default null,   -- 복수 섹터 OR 필터 (재귀 CTE: 자신 및 하위 레벨)
  p_category_ids       uuid[]  default null,   -- 복수 카테고리 OR 필터 (종목 경로 + 직접 연결 경로)
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
  -- 섹터 필터: 재귀 CTE로 지정된 섹터 자신 + 모든 하위 sector_id 집합
  -- 카테고리 필터: 플랫 구조(재귀 불필요), 종목 경로 + 직접 연결 경로 OR 합산
  with recursive sector_descendants as (
    select id from sectors where id = any(p_sector_ids)
    union all
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
  ),
  category_memo_ids as (
    -- 종목 경로: 카테고리에 속한 종목과 연결된 메모
    select distinct ms.memo_id
      from memo_stocks ms
      join user_category_stocks ucs on ucs.stock_id = ms.stock_id
     where ucs.category_id = any(p_category_ids)
    union
    -- 직접 연결 경로: 카테고리에 직접 연결된 메모
    select distinct mc.memo_id
      from memo_categories mc
     where mc.category_id = any(p_category_ids)
  )
  select count(distinct m.id)
    into v_total
    from memos m
   where m.user_id = v_user_id
     -- 날짜 범위 필터
     and (p_from is null or m.created_at::date >= p_from)
     and (p_to   is null or m.created_at::date <= p_to)
     -- p_no_links: 종목/매매이벤트/뉴스/섹터/카테고리 어떤 것도 연결되지 않은 메모만
     and (
       p_no_links = false
       or (
         not exists (select 1 from memo_stocks       ms  where ms.memo_id  = m.id)
         and not exists (select 1 from memo_trade_events mte where mte.memo_id = m.id)
         and not exists (select 1 from memo_news         mn  where mn.memo_id  = m.id)
         and not exists (select 1 from memo_sectors      mse where mse.memo_id = m.id)
         and not exists (select 1 from memo_categories   mc  where mc.memo_id  = m.id)
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
     )
     -- 카테고리 필터 (AND): 종목 경로 + 직접 연결 경로 OR 합산
     and (
       p_no_links = true
       or p_category_ids is null
       or cardinality(p_category_ids) = 0
       or m.id in (select memo_id from category_memo_ids)
     );

  -- 메모 목록 조회 (섹터/카테고리 필터는 카운트와 동일한 CTE 패턴 적용)
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
  ),
  category_memo_ids as (
    select distinct ms.memo_id
      from memo_stocks ms
      join user_category_stocks ucs on ucs.stock_id = ms.stock_id
     where ucs.category_id = any(p_category_ids)
    union
    select distinct mc.memo_id
      from memo_categories mc
     where mc.category_id = any(p_category_ids)
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
          'name_en',      se.name_en,
            'level',     se.level
          ))
          from memo_sectors mse
          join sectors se on se.id = mse.sector_id
          where mse.memo_id = m.id
        ), '[]'::json),
        'categories',   coalesce((
          select json_agg(json_build_object(
            'category_id', mc.category_id,
            'name',        uc.name
          ))
          from memo_categories mc
          join user_categories uc on uc.id = mc.category_id
          where mc.memo_id = m.id
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
           and not exists (select 1 from memo_categories   mc  where mc.memo_id  = m.id)
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
       and (
         p_no_links = true
         or p_category_ids is null
         or cardinality(p_category_ids) = 0
         or m.id in (select memo_id from category_memo_ids)
       )
     order by m.created_at desc, m.id desc
     limit  p_limit
     offset p_offset
  ) sub;

  return json_build_object(
    'memos',       v_memos,
    'total_count', v_total
  );
end;
$$;
