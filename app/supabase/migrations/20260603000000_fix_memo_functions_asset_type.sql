-- [hotfix] stocks.asset_type → stocks.market 변경에 따른 메모 함수 수정
--
-- 012 마이그레이션에서 stocks 테이블의 asset_type을 market으로 변경했으나,
-- 010 마이그레이션의 SQL 함수들이 여전히 s.asset_type을 참조하여 런타임 에러 발생.
--
-- 수정 대상:
--   1. create_memo_with_links  — JSON 반환부 s.asset_type → s.market
--   2. list_memos              — 변수/필터/JSON 반환부 전체
--   3. update_memo_with_links  — JSON 반환부 s.asset_type → s.market
--   4. create_trade_event_with_memo — stocks 조회 시 asset_type → market 매핑
--
-- account_events.asset_type은 변경 없음 (korean_stock/us_stock/crypto 유지)
-- stocks.market은 KR/US/CRYPTO

-- ────────────────────────────────────────────
-- asset_type → market 변환 헬퍼
-- account_events의 asset_type 값을 stocks의 market 값으로 변환
-- ────────────────────────────────────────────

create or replace function _ae_asset_type_to_market(p_asset_type text)
returns text
language sql
immutable
as $$
  select case p_asset_type
    when 'korean_stock' then 'KR'
    when 'us_stock'     then 'US'
    when 'crypto'       then 'CRYPTO'
    else null
  end;
$$;

create or replace function _market_to_ae_asset_type(p_market text)
returns text
language sql
immutable
as $$
  select case p_market
    when 'KR'     then 'korean_stock'
    when 'US'     then 'us_stock'
    when 'CRYPTO' then 'crypto'
    else null
  end;
$$;

-- ────────────────────────────────────────────
-- 1. create_memo_with_links — JSON 반환부 수정
-- ────────────────────────────────────────────

create or replace function create_memo_with_links(
  p_body             text,
  p_stocks           jsonb    default '[]'::jsonb,
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
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'p_body must not be empty'
      using errcode = 'check_violation';
  end if;

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

  insert into memos (user_id, body)
  values (v_user_id, p_body)
  returning id, created_at, updated_at into v_memo_id, v_created_at, v_updated_at;

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

  foreach v_event_id in array coalesce(p_trade_event_ids, '{}')
  loop
    insert into memo_trade_events (memo_id, event_id)
    values (v_memo_id, v_event_id);
  end loop;

  foreach v_news_id in array coalesce(p_news_ids, '{}')
  loop
    insert into memo_news (memo_id, news_id)
    values (v_memo_id, v_news_id);
  end loop;

  foreach v_sector_id in array coalesce(p_sector_ids, '{}')
  loop
    if not exists (select 1 from sectors where id = v_sector_id) then
      raise exception 'sector_id % does not exist', v_sector_id
        using errcode = 'foreign_key_violation';
    end if;

    insert into memo_sectors (memo_id, sector_id)
    values (v_memo_id, v_sector_id);
  end loop;

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
          'name',      se.name
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
-- 2. list_memos — 변수/필터/JSON 반환부 전체 수정
-- ────────────────────────────────────────────

create or replace function list_memos(
  p_from                  date     default null,
  p_to                    date     default null,
  p_stock_id              uuid     default null,
  p_include_trade_events  boolean  default true,
  p_trade_events_only     boolean  default false,
  p_news_only             boolean  default false,
  p_sector_id             int      default null,
  p_no_links              boolean  default false,
  p_limit                 int      default 20,
  p_offset                int      default 0
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid := auth.uid();
  v_memos        json;
  v_total        int;
  v_stock_ticker text;
  v_stock_market text;
begin
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_limit > 100 then
    raise exception 'p_limit must be <= 100, got %', p_limit
      using errcode = 'check_violation';
  end if;

  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'p_from must be <= p_to'
      using errcode = 'check_violation';
  end if;

  -- 종목 필터용 ticker/market 조회
  if p_stock_id is not null then
    select ticker, market into v_stock_ticker, v_stock_market
      from stocks
     where id = p_stock_id;
  end if;

  -- 전체 카운트
  select count(distinct m.id)
    into v_total
    from memos m
   where m.user_id = v_user_id
     and (p_from is null or m.created_at::date >= p_from)
     and (p_to   is null or m.created_at::date <= p_to)
     and (
       p_stock_id is null
       or exists (
         select 1 from memo_stocks ms
          where ms.memo_id = m.id and ms.stock_id = p_stock_id
       )
       or (
         p_include_trade_events = true
         and v_stock_ticker is not null
         and exists (
           select 1 from memo_trade_events mte
           join account_events ae on ae.id = mte.event_id
            where mte.memo_id = m.id
              and ae.ticker     = v_stock_ticker
              and ae.asset_type = _market_to_ae_asset_type(v_stock_market)
         )
       )
     )
     and (
       p_trade_events_only = false
       or exists (select 1 from memo_trade_events mte where mte.memo_id = m.id)
     )
     and (
       p_news_only = false
       or exists (select 1 from memo_news mn where mn.memo_id = m.id)
     )
     and (
       p_sector_id is null
       or exists (select 1 from memo_sectors mse where mse.memo_id = m.id and mse.sector_id = p_sector_id)
     )
     and (
       p_no_links = false
       or (
         not exists (select 1 from memo_stocks       ms  where ms.memo_id  = m.id)
         and not exists (select 1 from memo_trade_events mte where mte.memo_id = m.id)
         and not exists (select 1 from memo_news         mn  where mn.memo_id  = m.id)
         and not exists (select 1 from memo_sectors      mse where mse.memo_id = m.id)
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
         p_stock_id is null
         or exists (
           select 1 from memo_stocks ms
            where ms.memo_id = m.id and ms.stock_id = p_stock_id
         )
         or (
           p_include_trade_events = true
           and v_stock_ticker is not null
           and exists (
             select 1 from memo_trade_events mte
             join account_events ae on ae.id = mte.event_id
              where mte.memo_id = m.id
                and ae.ticker     = v_stock_ticker
                and ae.asset_type = _market_to_ae_asset_type(v_stock_market)
           )
         )
       )
       and (
         p_trade_events_only = false
         or exists (select 1 from memo_trade_events mte where mte.memo_id = m.id)
       )
       and (
         p_news_only = false
         or exists (select 1 from memo_news mn where mn.memo_id = m.id)
       )
       and (
         p_sector_id is null
         or exists (select 1 from memo_sectors mse where mse.memo_id = m.id and mse.sector_id = p_sector_id)
       )
       and (
         p_no_links = false
         or (
           not exists (select 1 from memo_stocks       ms  where ms.memo_id  = m.id)
           and not exists (select 1 from memo_trade_events mte where mte.memo_id = m.id)
           and not exists (select 1 from memo_news         mn  where mn.memo_id  = m.id)
           and not exists (select 1 from memo_sectors      mse where mse.memo_id = m.id)
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

-- ────────────────────────────────────────────
-- 3. update_memo_with_links — JSON 반환부 수정
-- ────────────────────────────────────────────

create or replace function update_memo_with_links(
  p_memo_id          uuid,
  p_body             text    default null,
  p_stocks           jsonb   default null,
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
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from memos
     where id = p_memo_id and user_id = v_user_id
  ) then
    raise exception 'memo % not found or access denied', p_memo_id
      using errcode = 'no_data_found';
  end if;

  if p_body is not null then
    if length(trim(p_body)) = 0 then
      raise exception 'p_body must not be empty string'
        using errcode = 'check_violation';
    end if;

    update memos
       set body = p_body
     where id = p_memo_id;
  end if;

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

  if p_trade_event_ids is not null then
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

  if p_news_ids is not null then
    delete from memo_news where memo_id = p_memo_id;

    foreach v_news_id in array p_news_ids
    loop
      insert into memo_news (memo_id, news_id)
      values (p_memo_id, v_news_id);
    end loop;
  end if;

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
          'name',      se.name
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

-- ────────────────────────────────────────────
-- 4. create_trade_event_with_memo — stocks 조회 시 매핑
-- ────────────────────────────────────────────

create or replace function create_trade_event_with_memo(
  p_event      jsonb,
  p_memo_body  text    default null,
  p_goal_price numeric default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id        uuid    := auth.uid();
  v_event_id       uuid;
  v_event_created  timestamptz;
  v_memo_id        uuid;
  v_memo_created   timestamptz;
  v_stock_id       uuid;
  v_event_type     text;
  v_event_date     date;
  v_asset_type     text;
  v_ticker         text;
  v_name           text;
  v_quantity       numeric;
  v_price_per_unit numeric;
  v_currency       text;
  v_fee            numeric;
  v_fee_currency   text;
  v_tax            numeric;
  v_amount         numeric;
  v_fx_rate        numeric;
  v_source         text;
  v_external_ref   text;
begin
  if v_user_id is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  v_event_type := p_event->>'event_type';
  if v_event_type not in ('buy', 'sell') then
    raise exception 'event_type must be buy or sell, got %', v_event_type
      using errcode = 'check_violation';
  end if;

  if p_memo_body is not null and length(trim(p_memo_body)) = 0 then
    raise exception 'p_memo_body must not be empty string'
      using errcode = 'check_violation';
  end if;

  if p_goal_price is not null and p_goal_price <= 0 then
    raise exception 'p_goal_price must be > 0, got %', p_goal_price
      using errcode = 'check_violation';
  end if;

  v_event_date     := (p_event->>'event_date')::date;
  v_asset_type     := p_event->>'asset_type';
  v_ticker         := p_event->>'ticker';
  v_name           := p_event->>'name';
  v_quantity       := (p_event->>'quantity')::numeric;
  v_price_per_unit := (p_event->>'price_per_unit')::numeric;
  v_currency       := p_event->>'currency';
  v_fee            := coalesce((p_event->>'fee')::numeric, 0);
  v_fee_currency   := p_event->>'fee_currency';
  v_tax            := coalesce((p_event->>'tax')::numeric, 0);
  v_amount         := (p_event->>'amount')::numeric;
  v_fx_rate        := (p_event->>'fx_rate_at_event')::numeric;
  v_source         := coalesce(p_event->>'source', 'manual');
  v_external_ref   := p_event->>'external_ref';

  insert into account_events (
    user_id, event_type, event_date, asset_type,
    ticker, name, quantity, price_per_unit,
    currency, fee, fee_currency, tax,
    amount, fx_rate_at_event, source, external_ref
  )
  values (
    v_user_id, v_event_type, v_event_date, v_asset_type,
    v_ticker, v_name, v_quantity, v_price_per_unit,
    v_currency, v_fee, v_fee_currency, v_tax,
    v_amount, v_fx_rate, v_source, v_external_ref
  )
  returning id, created_at into v_event_id, v_event_created;

  if p_memo_body is not null then
    -- stocks 테이블 조회: asset_type → market 매핑
    select id into v_stock_id
      from stocks
     where ticker = v_ticker
       and market = _ae_asset_type_to_market(v_asset_type);

    insert into memos (user_id, body)
    values (v_user_id, p_memo_body)
    returning id, created_at into v_memo_id, v_memo_created;

    insert into memo_trade_events (memo_id, event_id)
    values (v_memo_id, v_event_id);

    if v_stock_id is not null then
      insert into memo_stocks (memo_id, stock_id, goal_price)
      values (v_memo_id, v_stock_id, p_goal_price);
    end if;
  end if;

  return json_build_object(
    'event', json_build_object(
      'id',             v_event_id,
      'event_type',     v_event_type,
      'event_date',     v_event_date,
      'ticker',         v_ticker,
      'name',           v_name,
      'quantity',       v_quantity,
      'price_per_unit', v_price_per_unit,
      'currency',       v_currency,
      'fee',            v_fee,
      'tax',            v_tax,
      'amount',         v_amount,
      'created_at',     v_event_created
    ),
    'memo', case
      when v_memo_id is not null then
        json_build_object(
          'id',               v_memo_id,
          'body',             p_memo_body,
          'created_at',       v_memo_created,
          'linked_stock_id',  v_stock_id,
          'linked_event_id',  v_event_id,
          'goal_price',       p_goal_price
        )
      else null
    end
  );
end;
$$;
