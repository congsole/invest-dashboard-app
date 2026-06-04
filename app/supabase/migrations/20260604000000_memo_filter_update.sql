-- [014] 메모 필터 기능 수정
-- list_memos DB Function 시그니처 변경:
--   p_stock_id  (uuid 단건)    → p_stock_ids  (uuid[] 배열): 복수 종목 OR 필터
--   p_sector_id (int  단건)    → p_sector_ids (int[]  배열): 복수 섹터  OR 필터
--   p_include_trade_events 제거: 종목 필터는 항상 직접연결 + 매매이벤트 경유 연결을 함께 반환
--
-- 필터 결합 규칙
--   같은 타입 내 복수 선택 → OR
--   다른 타입 간            → AND
--   p_no_links = true       → 다른 모든 엔티티 필터 무시, 연결 없는 메모만 반환

create or replace function list_memos(
  p_from               date    default null,
  p_to                 date    default null,
  p_stock_ids          uuid[]  default null,   -- 복수 종목 OR 필터 (직접연결 + 매매이벤트 경유)
  p_trade_events_only  boolean default false,
  p_news_only          boolean default false,
  p_sector_ids         int[]   default null,   -- 복수 섹터 OR 필터
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
     -- p_no_links = true 이면 무시
     and (
       p_no_links = true
       or p_stock_ids is null
       or cardinality(p_stock_ids) = 0
       or exists (
         -- 직접 연결
         select 1 from memo_stocks ms
          where ms.memo_id  = m.id
            and ms.stock_id = any(p_stock_ids)
       )
       or exists (
         -- 매매이벤트 경유 연결: 해당 종목의 ticker + market 기반
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
     -- 섹터 필터 (OR): 하나라도 연관된 메모
     and (
       p_no_links = true
       or p_sector_ids is null
       or cardinality(p_sector_ids) = 0
       or exists (
         select 1 from memo_sectors mse
          where mse.memo_id  = m.id
            and mse.sector_id = any(p_sector_ids)
       )
     );

  -- 메모 목록 조회
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
            'name',      se.name
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
         or exists (
           select 1 from memo_sectors mse
            where mse.memo_id  = m.id
              and mse.sector_id = any(p_sector_ids)
         )
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
