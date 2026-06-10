-- 로컬 Supabase 시드 데이터 (supabase db reset 시 자동 적용)
--
-- 역할: 종목 마스터(stocks) 대표 샘플 적재.
--   - 운영에서는 scripts/seed_stocks.py 배치가 적재하지만, 로컬에는 배치를 돌리지 않으므로
--     앱을 로컬에 붙여 수동 테스트할 때 필요한 최소 마스터를 여기서 공급한다.
--   - sectors(GICS L1~L4 계층)는 마이그레이션에 시드가 포함되어 있어 여기서 다루지 않는다.
--   - Jest 통합 테스트는 자체적으로 데이터를 삽입/정리하므로 이 시드에 의존하지 않는다.
--
-- 섹터 매핑은 GICS L4(Sub-Industry) 코드 조회로 처리한다 (id 하드코딩 금지 — serial 채번이라 환경마다 다름).

insert into stocks (ticker, name, market, currency, is_active, sector_id)
select v.ticker, v.name, v.market, v.currency, true, s.id
from (values
  -- 한국 주식 (KRX 종목코드)
  ('005930', '삼성전자',          'KR', 'KRW', 'SEMI_MFG'),
  ('000660', 'SK하이닉스',        'KR', 'KRW', 'SEMI_MFG'),
  ('373220', 'LG에너지솔루션',    'KR', 'KRW', 'ELECTRICAL_COMPONENTS'),
  ('006400', '삼성SDI',           'KR', 'KRW', 'ELECTRICAL_COMPONENTS'),
  ('005380', '현대차',            'KR', 'KRW', 'AUTOMOBILE_MFG'),
  ('035420', 'NAVER',             'KR', 'KRW', 'INTERACTIVE_MEDIA_L4'),
  ('035720', '카카오',            'KR', 'KRW', 'INTERACTIVE_MEDIA_L4'),
  ('068270', '셀트리온',          'KR', 'KRW', 'BIOTECH_L4'),
  ('207940', '삼성바이오로직스',  'KR', 'KRW', 'BIOTECH_L4'),
  ('105560', 'KB금융',            'KR', 'KRW', 'DIVERSIFIED_BANKS'),
  ('005490', 'POSCO홀딩스',       'KR', 'KRW', 'STEEL'),

  -- 미국 주식
  ('AAPL',   'Apple',             'US', 'USD', 'TECH_HW_STORAGE_L4'),
  ('MSFT',   'Microsoft',         'US', 'USD', 'SYSTEMS_SW'),
  ('NVDA',   'NVIDIA',            'US', 'USD', 'SEMI_MFG'),
  ('GOOGL',  'Alphabet',          'US', 'USD', 'INTERACTIVE_MEDIA_L4'),
  ('AMZN',   'Amazon',            'US', 'USD', 'BROADLINE_RETAIL_L4'),
  ('TSLA',   'Tesla',             'US', 'USD', 'AUTOMOBILE_MFG'),
  ('JPM',    'JPMorgan Chase',    'US', 'USD', 'DIVERSIFIED_BANKS'),
  ('JNJ',    'Johnson & Johnson', 'US', 'USD', 'PHARMA_L4'),
  ('XOM',    'Exxon Mobil',       'US', 'USD', 'OIL_GAS_INTEGRATED'),
  ('KO',     'Coca-Cola',         'US', 'USD', 'SOFT_DRINKS'),

  -- 가상자산 (L1 CRYPTO 직접 매핑)
  ('BTC',    '비트코인',          'CRYPTO', 'USD', 'CRYPTO'),
  ('ETH',    '이더리움',          'CRYPTO', 'USD', 'CRYPTO'),
  ('SOL',    '솔라나',            'CRYPTO', 'USD', 'CRYPTO')
) as v(ticker, name, market, currency, sector_code)
join sectors s on s.code = v.sector_code
on conflict (ticker, market) do nothing;
