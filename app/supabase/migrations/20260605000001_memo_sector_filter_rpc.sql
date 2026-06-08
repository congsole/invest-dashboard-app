-- [019] 메모 섹터 필터 RPC 로직 확장 (종목 경로 + 직접 연결 경로 OR 합산)
--
-- 변경 사항:
-- 1. list_memos — 섹터 필터에 재귀 CTE 기반 두 경로 합산 적용
--    - 종목 경로: 지정된 섹터의 하위 전체에 속하는 종목(stocks.sector_id)에 연결된 메모
--    - 직접 연결 경로: memo_sectors로 해당 섹터/하위에 직접 연결된 메모
-- 2. list_memos / create_memo_with_links / update_memo_with_links 응답의
--    sectors 배열에 level, name_en 필드 추가

-- ────────────────────────────────────────────
-- DROP existing list_memos before recreating
-- (시그니처 변경 없음, CREATE OR REPLACE로 충분하나 명시적 drop으로 안전하게 처리)
-- ────────────────────────────────────────────

drop function if exists public.list_memos(date, date, uuid[], boolean, boolean, int[], boolean, int, int);

-- ────────────────────────────────────────────
-- list_memos — 섹터 필터 두 경로 합산 + sectors.level/name_en 포함
-- ────────────────────────────────────────────

create or replace function list_memos(
  p_from               date    default null,
  p_to                 date    default null,
  p_stock_ids          uuid[]  default null,   -- 복수 종목 OR 필터 (직접연결 + 매매이벤트 경유)
  p_trade_events_only  boolean default false,
  p_news_only          boolean default false,
  p_sector_ids         int[]   default null,   -- 복수 섹터 OR 필터 (종목 경로 + 직접 연결 경로 합산)
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
  -- 섹터 필터는 재귀 CTE로 지정된 섹터의 모든 하위 sector_id 집합을 구한 뒤,
  -- 종목 경로(memo_stocks JOIN stocks) UNION 직접 연결 경로(memo_sectors)로 판단
  with recursive sector_descendants as (
    -- 지정된 섹터 자신 포함
    select id from sectors where id = any(p_sector_ids)
    union all
    -- 하위 섹터 재귀 탐색
    select s.id
      from sectors s
      join sector_descendants d on s.parent_id = d.id
  ),
  sector_memo_ids as (
    -- 종목 경로: 하위 섹터에 속하는 종목에 연결된 메모
    select distinct ms.memo_id
      from memo_stocks ms
      join stocks st on st.id = ms.stock_id
     where st.sector_id in (select id from sector_descendants)
    union
    -- 직접 연결 경로: 하위 섹터에 직접 연결된 메모
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
     -- 섹터 필터: 종목 경로 + 직접 연결 경로 OR 합산 (재귀 CTE 기반)
     and (
       p_no_links = true
       or p_sector_ids is null
       or cardinality(p_sector_ids) = 0
       or m.id in (select memo_id from sector_memo_ids)
     );

  -- 메모 목록 조회
  -- 섹터 필터는 카운트와 동일한 CTE 패턴 적용
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

-- ────────────────────────────────────────────
-- create_memo_with_links — sectors 응답에 level, name_en 추가
-- ────────────────────────────────────────────

create or replace function create_memo_with_links(
  p_body             text,
  p_stocks           jsonb    default '[]'::jsonb,   -- [{stock_id, goal_price}]
  p_trade_event_ids  uuid[]   default '{}',
  p_news_ids         uuid[]   default '{}',
  p_sector_ids       int[]    default '{}'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid    := auth.uid();
  v_memo_id    uuid;
  v_created_at timestamptz;
  v_updated_at timestamptz;
  v_stock      jsonb;
  v_stock_id   uuid;
  v_goal_price numeric;
  v_event_id   uuid;
  v_event_type text;
  v_news_id    uuid;
  v_sector_id  int;
begin
  -- 인증 확인
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  -- body 유효성 검사
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'p_body must not be empty'
      using errcode = 'check_violation';
  end if;

  -- trade_event_ids: buy/sell만 허용 (사전 유효성 검사)
  foreach v_event_id in array coalesce(p_trade_event_ids, '{}')
  loop
    select event_type into v_event_type
      from account_events
     where id = v_event_id;

    if not found then
      raise exception 'event_id % does not exist', v_event_id
        using errcode = 'foreign_key_violation';
    end if;

    if v_event_type not in ('buy', 'sell') then
      raise exception 'event_id % has event_type %, only buy/sell allowed', v_event_id, v_event_type
        using errcode = 'check_violation';
    end if;
  end loop;

  -- 메모 본체 생성
  insert into memos (user_id, body)
  values (v_user_id, p_body)
  returning id, created_at, updated_at into v_memo_id, v_created_at, v_updated_at;

  -- 종목 연결
  for v_stock in select * from jsonb_array_elements(coalesce(p_stocks, '[]'::jsonb))
  loop
    v_stock_id   := (v_stock->>'stock_id')::uuid;
    v_goal_price := case
      when v_stock->>'goal_price' is null then null
      else (v_stock->>'goal_price')::numeric
    end;

    if v_goal_price is not null and v_goal_price <= 0 then
      raise exception 'goal_price must be > 0, got %', v_goal_price
        using errcode = 'check_violation';
    end if;

    if not exists (select 1 from stocks where id = v_stock_id) then
      raise exception 'stock_id % does not exist', v_stock_id
        using errcode = 'foreign_key_violation';
    end if;

    insert into memo_stocks (memo_id, stock_id, goal_price)
    values (v_memo_id, v_stock_id, v_goal_price);
  end loop;

  -- 매매이벤트 연결
  foreach v_event_id in array coalesce(p_trade_event_ids, '{}')
  loop
    insert into memo_trade_events (memo_id, event_id)
    values (v_memo_id, v_event_id);
  end loop;

  -- 뉴스 연결
  foreach v_news_id in array coalesce(p_news_ids, '{}')
  loop
    insert into memo_news (memo_id, news_id)
    values (v_memo_id, v_news_id);
  end loop;

  -- 섹터 연결 (L1~L4 어느 레벨이든 가능)
  foreach v_sector_id in array coalesce(p_sector_ids, '{}')
  loop
    if not exists (select 1 from sectors where id = v_sector_id) then
      raise exception 'sector_id % does not exist', v_sector_id
        using errcode = 'foreign_key_violation';
    end if;

    insert into memo_sectors (memo_id, sector_id)
    values (v_memo_id, v_sector_id);
  end loop;

  -- 결과 반환 (sectors에 level, name_en 포함)
  return (
    select json_build_object(
      'id',           m.id,
      'user_id',      m.user_id,
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
    )
    from memos m
    where m.id = v_memo_id
  );
end;
$$;

-- ────────────────────────────────────────────
-- update_memo_with_links — sectors 응답에 level, name_en 추가
-- ────────────────────────────────────────────

create or replace function update_memo_with_links(
  p_memo_id          uuid,
  p_body             text    default null,
  p_stocks           jsonb   default null,   -- null: 변경 안 함, []: 전체 해제
  p_trade_event_ids  uuid[]  default null,
  p_news_ids         uuid[]  default null,
  p_sector_ids       int[]   default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid    := auth.uid();
  v_stock      jsonb;
  v_stock_id   uuid;
  v_goal_price numeric;
  v_event_id   uuid;
  v_event_type text;
  v_news_id    uuid;
  v_sector_id  int;
begin
  -- 인증 확인
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  -- 메모 소유권 확인
  if not exists (
    select 1 from memos
     where id = p_memo_id and user_id = v_user_id
  ) then
    raise exception 'memo % not found or access denied', p_memo_id
      using errcode = 'no_data_found';
  end if;

  -- body 수정
  if p_body is not null then
    if length(trim(p_body)) = 0 then
      raise exception 'p_body must not be empty string'
        using errcode = 'check_violation';
    end if;

    update memos
       set body = p_body
     where id = p_memo_id;
  end if;

  -- 종목 연결 교체
  if p_stocks is not null then
    delete from memo_stocks where memo_id = p_memo_id;

    for v_stock in select * from jsonb_array_elements(p_stocks)
    loop
      v_stock_id   := (v_stock->>'stock_id')::uuid;
      v_goal_price := case
        when v_stock->>'goal_price' is null then null
        else (v_stock->>'goal_price')::numeric
      end;

      if v_goal_price is not null and v_goal_price <= 0 then
        raise exception 'goal_price must be > 0, got %', v_goal_price
          using errcode = 'check_violation';
      end if;

      if not exists (select 1 from stocks where id = v_stock_id) then
        raise exception 'stock_id % does not exist', v_stock_id
          using errcode = 'foreign_key_violation';
      end if;

      insert into memo_stocks (memo_id, stock_id, goal_price)
      values (p_memo_id, v_stock_id, v_goal_price);
    end loop;
  end if;

  -- 매매이벤트 연결 교체
  if p_trade_event_ids is not null then
    -- 유효성 검사 먼저
    foreach v_event_id in array p_trade_event_ids
    loop
      select event_type into v_event_type
        from account_events
       where id = v_event_id;

      if not found then
        raise exception 'event_id % does not exist', v_event_id
          using errcode = 'foreign_key_violation';
      end if;

      if v_event_type not in ('buy', 'sell') then
        raise exception 'event_id % has event_type %, only buy/sell allowed', v_event_id, v_event_type
          using errcode = 'check_violation';
      end if;
    end loop;

    delete from memo_trade_events where memo_id = p_memo_id;

    foreach v_event_id in array p_trade_event_ids
    loop
      insert into memo_trade_events (memo_id, event_id)
      values (p_memo_id, v_event_id);
    end loop;
  end if;

  -- 뉴스 연결 교체
  if p_news_ids is not null then
    delete from memo_news where memo_id = p_memo_id;

    foreach v_news_id in array p_news_ids
    loop
      insert into memo_news (memo_id, news_id)
      values (p_memo_id, v_news_id);
    end loop;
  end if;

  -- 섹터 연결 교체 (L1~L4 어느 레벨이든 가능)
  if p_sector_ids is not null then
    delete from memo_sectors where memo_id = p_memo_id;

    foreach v_sector_id in array p_sector_ids
    loop
      if not exists (select 1 from sectors where id = v_sector_id) then
        raise exception 'sector_id % does not exist', v_sector_id
          using errcode = 'foreign_key_violation';
      end if;

      insert into memo_sectors (memo_id, sector_id)
      values (p_memo_id, v_sector_id);
    end loop;
  end if;

  -- 결과 반환 (sectors에 level, name_en 포함)
  return (
    select json_build_object(
      'id',           m.id,
      'user_id',      m.user_id,
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
    )
    from memos m
    where m.id = p_memo_id
  );
end;
$$;
