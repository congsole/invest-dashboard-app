-- [016] GICS 계층화 — sectors 테이블 스키마 변경 + GICS 시드 + gics_yfinance_map + RPC 업데이트

-- ────────────────────────────────────────────
-- 1. sectors 테이블 스키마 변경
-- ────────────────────────────────────────────

-- 신규 컬럼 추가
alter table sectors
  add column if not exists name_en    text,
  add column if not exists parent_id  int references sectors(id),
  add column if not exists level      int not null default 1
    check (level between 1 and 4),
  add column if not exists created_at timestamptz not null default now();

-- 기존 12개 L1 시드에 level=1, parent_id=null, name_en 채우기
update sectors set level = 1, parent_id = null, name_en = 'Information Technology'     where id = 1;
update sectors set level = 1, parent_id = null, name_en = 'Health Care'                where id = 2;
update sectors set level = 1, parent_id = null, name_en = 'Financials'                 where id = 3;
update sectors set level = 1, parent_id = null, name_en = 'Consumer Discretionary'     where id = 4;
update sectors set level = 1, parent_id = null, name_en = 'Consumer Staples'           where id = 5;
update sectors set level = 1, parent_id = null, name_en = 'Communication Services'     where id = 6;
update sectors set level = 1, parent_id = null, name_en = 'Industrials'                where id = 7;
update sectors set level = 1, parent_id = null, name_en = 'Materials'                  where id = 8;
update sectors set level = 1, parent_id = null, name_en = 'Energy'                     where id = 9;
update sectors set level = 1, parent_id = null, name_en = 'Utilities'                  where id = 10;
update sectors set level = 1, parent_id = null, name_en = 'Real Estate'                where id = 11;
update sectors set level = 1, parent_id = null, name_en = 'Crypto'                     where id = 12;

-- id를 serial로 전환 (시퀀스 시작값 13 이상 보장)
-- 이미 int PK인 경우, 시퀀스 생성 후 연결
create sequence if not exists sectors_id_seq start with 13;
alter table sectors alter column id set default nextval('sectors_id_seq');
select setval('sectors_id_seq', greatest(13, (select coalesce(max(id), 12) + 1 from sectors)));

-- 인덱스 추가
create index if not exists idx_sectors_parent_id on sectors (parent_id);
create index if not exists idx_sectors_level     on sectors (level);

-- ────────────────────────────────────────────
-- 2. GICS L2 시드 (Industry Group, 25개)
--    parent_id = L1 sector id (1~11)
-- ────────────────────────────────────────────

insert into sectors (code, name, name_en, parent_id, level) values
  -- IT (parent_id=1)
  ('SOFTWARE_SERVICES',      '소프트웨어및서비스',        'Software & Services',                      1, 2),
  ('TECH_HARDWARE',          '기술하드웨어및장비',         'Technology Hardware & Equipment',           1, 2),
  ('SEMICON_EQUIP',          '반도체및반도체장비',         'Semiconductors & Semiconductor Equipment',  1, 2),
  -- Health Care (parent_id=2)
  ('PHARMA_BIOTECH',         '제약바이오라이프사이언스',    'Pharmaceuticals Biotechnology & Life Sciences', 2, 2),
  ('HEALTHCARE_EQUIP',       '헬스케어장비및서비스',       'Health Care Equipment & Services',          2, 2),
  -- Financials (parent_id=3)
  ('BANKS',                  '은행',                     'Banks',                                     3, 2),
  ('DIVERSIFIED_FINANCIALS', '다각화금융',                'Diversified Financials',                    3, 2),
  ('INSURANCE',              '보험',                     'Insurance',                                 3, 2),
  -- Consumer Discretionary (parent_id=4)
  ('AUTOS_COMPONENTS',       '자동차및부품',              'Automobiles & Components',                  4, 2),
  ('CONSUMER_DURABLES',      '내구소비재및의류',           'Consumer Durables & Apparel',               4, 2),
  ('CONSUMER_SERVICES',      '소비자서비스',              'Consumer Services',                         4, 2),
  ('RETAILING',              '소매',                     'Retailing',                                 4, 2),
  -- Consumer Staples (parent_id=5)
  ('FOOD_BEVERAGE',          '식품음료담배',              'Food Beverage & Tobacco',                   5, 2),
  ('FOOD_RETAILING',         '식품유통및기초식품',         'Food & Staples Retailing',                  5, 2),
  ('HOUSEHOLD_PRODUCTS',     '가정용품및개인용품',         'Household & Personal Products',             5, 2),
  -- Communication Services (parent_id=6)
  ('TELECOM_SERVICES',       '통신서비스',               'Telecommunication Services',                 6, 2),
  ('MEDIA_ENTERTAINMENT',    '미디어및엔터테인먼트',       'Media & Entertainment',                     6, 2),
  -- Industrials (parent_id=7)
  ('CAPITAL_GOODS',          '자본재',                   'Capital Goods',                             7, 2),
  ('COMMERCIAL_SERVICES',    '상업서비스및용품',          'Commercial & Professional Services',        7, 2),
  ('TRANSPORTATION',         '운수',                     'Transportation',                            7, 2),
  -- Materials (parent_id=8)
  ('MATERIALS_GROUP',        '소재',                     'Materials',                                 8, 2),
  -- Energy (parent_id=9)
  ('ENERGY_GROUP',           '에너지',                   'Energy',                                    9, 2),
  -- Utilities (parent_id=10)
  ('UTILITIES_GROUP',        '유틸리티',                 'Utilities',                                 10, 2),
  -- Real Estate (parent_id=11)
  ('RE_MGMT_DEV',            '부동산관리및개발',           'Real Estate Management & Development',      11, 2),
  ('REITS',                  '리츠',                     'Real Estate Investment Trusts (REITs)',      11, 2)
on conflict (code) do nothing;

-- ────────────────────────────────────────────
-- 3. GICS L3 시드 (Industry, 74개)
--    parent_id = L2 sector id (위에서 삽입된 값)
-- ────────────────────────────────────────────

insert into sectors (code, name, name_en, parent_id, level)
select code, name, name_en, parent_id, 3
from (values
  -- Software & Services (L2: SOFTWARE_SERVICES)
  ('IT_SERVICES',          'IT서비스',           'IT Services',                    (select id from sectors where code='SOFTWARE_SERVICES')),
  ('SOFTWARE_IND',         '소프트웨어',          'Software',                       (select id from sectors where code='SOFTWARE_SERVICES')),
  -- Technology Hardware & Equipment (L2: TECH_HARDWARE)
  ('COMM_EQUIPMENT',       '통신장비',           'Communications Equipment',        (select id from sectors where code='TECH_HARDWARE')),
  ('TECH_HARDWARE_STORAGE','기술하드웨어저장주변기기','Technology Hardware Storage & Peripherals', (select id from sectors where code='TECH_HARDWARE')),
  ('ELEC_EQUIPMENT',       '전자장비기기부품',    'Electronic Equipment Instruments & Components', (select id from sectors where code='TECH_HARDWARE')),
  -- Semiconductors & Semiconductor Equipment (L2: SEMICON_EQUIP)
  ('SEMICON_EQUIP_IND',    '반도체장비',          'Semiconductor Equipment',        (select id from sectors where code='SEMICON_EQUIP')),
  ('SEMICONDUCTORS_IND',   '반도체',              'Semiconductors',                 (select id from sectors where code='SEMICON_EQUIP')),
  -- Pharmaceuticals Biotechnology & Life Sciences (L2: PHARMA_BIOTECH)
  ('BIOTECH',              '바이오테크',          'Biotechnology',                  (select id from sectors where code='PHARMA_BIOTECH')),
  ('PHARMA',               '제약',               'Pharmaceuticals',                (select id from sectors where code='PHARMA_BIOTECH')),
  ('LIFE_SCIENCES',        '생명과학도구및서비스', 'Life Sciences Tools & Services', (select id from sectors where code='PHARMA_BIOTECH')),
  -- Health Care Equipment & Services (L2: HEALTHCARE_EQUIP)
  ('HEALTHCARE_EQUIP_IND', '헬스케어장비및용품',  'Health Care Equipment & Supplies', (select id from sectors where code='HEALTHCARE_EQUIP')),
  ('HEALTHCARE_PROVIDERS', '헬스케어제공업체및서비스','Health Care Providers & Services', (select id from sectors where code='HEALTHCARE_EQUIP')),
  ('HEALTHCARE_TECH',      '헬스케어기술',        'Health Care Technology',         (select id from sectors where code='HEALTHCARE_EQUIP')),
  -- Banks (L2: BANKS)
  ('BANKS_IND',            '은행',               'Banks',                          (select id from sectors where code='BANKS')),
  ('THRIFTS_MORTGAGE',     '저축기관및모기지금융', 'Thrifts & Mortgage Finance',     (select id from sectors where code='BANKS')),
  -- Diversified Financials (L2: DIVERSIFIED_FINANCIALS)
  ('DIV_FINANCIAL_SVCS',   '다각화금융서비스',    'Diversified Financial Services', (select id from sectors where code='DIVERSIFIED_FINANCIALS')),
  ('CONSUMER_FINANCE',     '소비자금융',          'Consumer Finance',               (select id from sectors where code='DIVERSIFIED_FINANCIALS')),
  ('CAPITAL_MARKETS',      '자본시장',            'Capital Markets',                (select id from sectors where code='DIVERSIFIED_FINANCIALS')),
  ('MORTGAGE_REITS',       '모기지리츠',          'Mortgage Real Estate Investment Trusts (REITs)', (select id from sectors where code='DIVERSIFIED_FINANCIALS')),
  -- Insurance (L2: INSURANCE)
  ('INSURANCE_IND',        '보험',               'Insurance',                      (select id from sectors where code='INSURANCE')),
  -- Automobiles & Components (L2: AUTOS_COMPONENTS)
  ('AUTO_COMPONENTS',      '자동차부품',          'Automobile Components',          (select id from sectors where code='AUTOS_COMPONENTS')),
  ('AUTOMOBILES',          '자동차',             'Automobiles',                    (select id from sectors where code='AUTOS_COMPONENTS')),
  -- Consumer Durables & Apparel (L2: CONSUMER_DURABLES)
  ('HOUSEHOLD_DURABLES',   '가정용내구재',        'Household Durables',             (select id from sectors where code='CONSUMER_DURABLES')),
  ('LEISURE_PRODUCTS',     '레저용품',            'Leisure Products',               (select id from sectors where code='CONSUMER_DURABLES')),
  ('TEXTILES_APPAREL',     '섬유의류및사치품',    'Textiles Apparel & Luxury Goods', (select id from sectors where code='CONSUMER_DURABLES')),
  -- Consumer Services (L2: CONSUMER_SERVICES)
  ('HOTELS_RESTAURANTS',   '호텔레스토랑및레저', 'Hotels Restaurants & Leisure',   (select id from sectors where code='CONSUMER_SERVICES')),
  ('DIVERSIFIED_CONSUMER', '다각화소비자서비스',  'Diversified Consumer Services',  (select id from sectors where code='CONSUMER_SERVICES')),
  -- Retailing (L2: RETAILING)
  ('DISTRIBUTORS',         '유통업체',            'Distributors',                   (select id from sectors where code='RETAILING')),
  ('BROADLINE_RETAIL',     '광범위소매',          'Broadline Retail',               (select id from sectors where code='RETAILING')),
  ('SPECIALTY_RETAIL',     '전문소매',            'Specialty Retail',               (select id from sectors where code='RETAILING')),
  -- Food Beverage & Tobacco (L2: FOOD_BEVERAGE)
  ('BEVERAGES',            '음료',               'Beverages',                      (select id from sectors where code='FOOD_BEVERAGE')),
  ('FOOD_PRODUCTS',        '식품',               'Food Products',                  (select id from sectors where code='FOOD_BEVERAGE')),
  ('TOBACCO',              '담배',               'Tobacco',                        (select id from sectors where code='FOOD_BEVERAGE')),
  -- Food & Staples Retailing (L2: FOOD_RETAILING)
  ('FOOD_STAPLES_RETAIL',  '식품및기초식품소매',  'Food & Staples Retailing',       (select id from sectors where code='FOOD_RETAILING')),
  -- Household & Personal Products (L2: HOUSEHOLD_PRODUCTS)
  ('HOUSEHOLD_PRODS',      '가정용품',            'Household Products',             (select id from sectors where code='HOUSEHOLD_PRODUCTS')),
  ('PERSONAL_CARE_PRODS',  '개인용품',            'Personal Care Products',         (select id from sectors where code='HOUSEHOLD_PRODUCTS')),
  -- Telecommunication Services (L2: TELECOM_SERVICES)
  ('DIV_TELECOM',          '다각화통신서비스',    'Diversified Telecommunication Services', (select id from sectors where code='TELECOM_SERVICES')),
  ('WIRELESS_TELECOM',     '무선통신서비스',      'Wireless Telecommunication Services',    (select id from sectors where code='TELECOM_SERVICES')),
  -- Media & Entertainment (L2: MEDIA_ENTERTAINMENT)
  ('MEDIA',                '미디어',             'Media',                          (select id from sectors where code='MEDIA_ENTERTAINMENT')),
  ('ENTERTAINMENT',        '엔터테인먼트',        'Entertainment',                  (select id from sectors where code='MEDIA_ENTERTAINMENT')),
  ('INTERACTIVE_MEDIA',    '인터랙티브미디어및서비스','Interactive Media & Services',(select id from sectors where code='MEDIA_ENTERTAINMENT')),
  -- Capital Goods (L2: CAPITAL_GOODS)
  ('AEROSPACE_DEFENSE',    '항공우주및방산',      'Aerospace & Defense',            (select id from sectors where code='CAPITAL_GOODS')),
  ('BUILDING_PRODUCTS',    '건축자재',            'Building Products',              (select id from sectors where code='CAPITAL_GOODS')),
  ('CONSTRUCTION_ENG',     '건설및엔지니어링',    'Construction & Engineering',     (select id from sectors where code='CAPITAL_GOODS')),
  ('ELECTRICAL_EQUIPMENT', '전기장비',            'Electrical Equipment',           (select id from sectors where code='CAPITAL_GOODS')),
  ('INDUSTRIAL_CONGLOM',   '복합기업',            'Industrial Conglomerates',       (select id from sectors where code='CAPITAL_GOODS')),
  ('MACHINERY',            '기계',               'Machinery',                      (select id from sectors where code='CAPITAL_GOODS')),
  ('TRADING_DISTRIBUTION', '무역및유통',          'Trading Companies & Distributors', (select id from sectors where code='CAPITAL_GOODS')),
  -- Commercial & Professional Services (L2: COMMERCIAL_SERVICES)
  ('COMMERCIAL_SVCS',      '상업서비스및용품',    'Commercial Services & Supplies', (select id from sectors where code='COMMERCIAL_SERVICES')),
  ('PROFESSIONAL_SVCS',    '전문서비스',          'Professional Services',          (select id from sectors where code='COMMERCIAL_SERVICES')),
  -- Transportation (L2: TRANSPORTATION)
  ('AIR_FREIGHT',          '항공화물및물류',      'Air Freight & Logistics',        (select id from sectors where code='TRANSPORTATION')),
  ('PASSENGER_AIRLINES',   '여객항공사',          'Passenger Airlines',             (select id from sectors where code='TRANSPORTATION')),
  ('MARINE_TRANSPORT',     '해상운송',            'Marine Transportation',          (select id from sectors where code='TRANSPORTATION')),
  ('GROUND_TRANSPORT',     '지상운송',            'Ground Transportation',          (select id from sectors where code='TRANSPORTATION')),
  ('TRANSPORT_INFRA',      '운수인프라',          'Transportation Infrastructure',  (select id from sectors where code='TRANSPORTATION')),
  -- Materials (L2: MATERIALS_GROUP)
  ('CHEMICALS',            '화학',               'Chemicals',                      (select id from sectors where code='MATERIALS_GROUP')),
  ('CONSTRUCTION_MATERIALS','건설자재',           'Construction Materials',         (select id from sectors where code='MATERIALS_GROUP')),
  ('CONTAINERS_PACKAGING', '용기및포장',          'Containers & Packaging',         (select id from sectors where code='MATERIALS_GROUP')),
  ('METALS_MINING',        '금속및광업',          'Metals & Mining',                (select id from sectors where code='MATERIALS_GROUP')),
  ('PAPER_FOREST',         '종이및목재제품',      'Paper & Forest Products',        (select id from sectors where code='MATERIALS_GROUP')),
  -- Energy (L2: ENERGY_GROUP)
  ('ENERGY_EQUIP_SVCS',    '에너지장비및서비스',  'Energy Equipment & Services',    (select id from sectors where code='ENERGY_GROUP')),
  ('OIL_GAS',              '석유가스및소모연료',  'Oil Gas & Consumable Fuels',     (select id from sectors where code='ENERGY_GROUP')),
  -- Utilities (L2: UTILITIES_GROUP)
  ('ELEC_UTILITIES',       '전기유틸리티',        'Electric Utilities',             (select id from sectors where code='UTILITIES_GROUP')),
  ('GAS_UTILITIES',        '가스유틸리티',        'Gas Utilities',                  (select id from sectors where code='UTILITIES_GROUP')),
  ('MULTI_UTILITIES',      '복합유틸리티',        'Multi-Utilities',                (select id from sectors where code='UTILITIES_GROUP')),
  ('WATER_UTILITIES',      '수도유틸리티',        'Water Utilities',                (select id from sectors where code='UTILITIES_GROUP')),
  ('INDEP_POWER',          '독립발전사업자및에너지거래업체','Independent Power Producers & Energy Traders', (select id from sectors where code='UTILITIES_GROUP')),
  ('RENEWABLE_ELEC',       '신재생전기',          'Renewable Electricity',          (select id from sectors where code='UTILITIES_GROUP')),
  -- Real Estate Management & Development (L2: RE_MGMT_DEV)
  ('DIV_REITS',            '다각화리츠',          'Diversified REITs',              (select id from sectors where code='RE_MGMT_DEV')),
  ('INDUSTRIAL_REITS',     '산업용리츠',          'Industrial REITs',               (select id from sectors where code='RE_MGMT_DEV')),
  ('HOTEL_RESORT_REITS',   '호텔및리조트리츠',   'Hotel & Resort REITs',           (select id from sectors where code='RE_MGMT_DEV')),
  ('OFFICE_REITS',         '오피스리츠',          'Office REITs',                   (select id from sectors where code='RE_MGMT_DEV')),
  ('HEALTHCARE_REITS',     '헬스케어리츠',        'Health Care REITs',              (select id from sectors where code='RE_MGMT_DEV')),
  ('RESIDENTIAL_REITS',    '주거용리츠',          'Residential REITs',              (select id from sectors where code='RE_MGMT_DEV')),
  ('RETAIL_REITS',         '리테일리츠',          'Retail REITs',                   (select id from sectors where code='RE_MGMT_DEV')),
  ('SPECIALIZED_REITS',    '특수리츠',            'Specialized REITs',              (select id from sectors where code='RE_MGMT_DEV')),
  ('RE_MGMT_DEV_IND',      '부동산관리및개발',    'Real Estate Management & Development', (select id from sectors where code='RE_MGMT_DEV'))
) as t(code, name, name_en, parent_id)
on conflict (code) do nothing;

-- ────────────────────────────────────────────
-- 4. GICS L4 시드 (Sub-Industry, 163개)
--    parent_id = L3 sector id
-- ────────────────────────────────────────────

insert into sectors (code, name, name_en, parent_id, level)
select code, name, name_en, parent_id, 4
from (values
  -- IT Services
  ('IT_CONSULTING',          'IT컨설팅및기타서비스',   'IT Consulting & Other Services',            (select id from sectors where code='IT_SERVICES')),
  ('INTERNET_SVCS_INFRA',    '인터넷서비스및인프라',   'Internet Services & Infrastructure',        (select id from sectors where code='IT_SERVICES')),
  ('DATA_PROCESSING',        '데이터처리및아웃소싱',   'Data Processing & Outsourced Services',     (select id from sectors where code='IT_SERVICES')),
  -- Software
  ('APPLICATION_SW',         '애플리케이션소프트웨어', 'Application Software',                      (select id from sectors where code='SOFTWARE_IND')),
  ('SYSTEMS_SW',             '시스템소프트웨어',       'Systems Software',                          (select id from sectors where code='SOFTWARE_IND')),
  -- Communications Equipment
  ('COMM_EQUIP_L4',          '통신장비',               'Communications Equipment',                  (select id from sectors where code='COMM_EQUIPMENT')),
  -- Technology Hardware Storage & Peripherals
  ('TECH_HW_STORAGE_L4',     '기술하드웨어저장주변기기','Technology Hardware Storage & Peripherals', (select id from sectors where code='TECH_HARDWARE_STORAGE')),
  -- Electronic Equipment Instruments & Components
  ('ELECTRONIC_EQUIP_L4',    '전자장비및기기',         'Electronic Equipment & Instruments',        (select id from sectors where code='ELEC_EQUIPMENT')),
  ('ELECTRONIC_COMPONENTS',  '전자부품',               'Electronic Components',                     (select id from sectors where code='ELEC_EQUIPMENT')),
  ('ELECTRONIC_MFG_SVCS',    '전자제조서비스',         'Electronic Manufacturing Services',         (select id from sectors where code='ELEC_EQUIPMENT')),
  ('TECH_DISTRIBUTORS',      '기술유통업체',           'Technology Distributors',                   (select id from sectors where code='ELEC_EQUIPMENT')),
  -- Semiconductor Equipment
  ('SEMI_EQUIP_L4',          '반도체장비',             'Semiconductor Equipment',                   (select id from sectors where code='SEMICON_EQUIP_IND')),
  -- Semiconductors
  ('SEMI_MFG',               '반도체제조',             'Semiconductor Manufacturing',               (select id from sectors where code='SEMICONDUCTORS_IND')),
  -- Biotechnology
  ('BIOTECH_L4',             '바이오테크',             'Biotechnology',                             (select id from sectors where code='BIOTECH')),
  -- Pharmaceuticals
  ('PHARMA_L4',              '제약',                   'Pharmaceuticals',                           (select id from sectors where code='PHARMA')),
  -- Life Sciences Tools & Services
  ('LIFE_SCIENCES_L4',       '생명과학도구및서비스',   'Life Sciences Tools & Services',            (select id from sectors where code='LIFE_SCIENCES')),
  -- Health Care Equipment & Supplies
  ('HEALTHCARE_EQUIP_L4',    '헬스케어장비',           'Health Care Equipment',                     (select id from sectors where code='HEALTHCARE_EQUIP_IND')),
  ('HEALTHCARE_SUPPLIES',    '헬스케어용품',           'Health Care Supplies',                      (select id from sectors where code='HEALTHCARE_EQUIP_IND')),
  -- Health Care Providers & Services
  ('HEALTHCARE_DISTRIBUTORS','헬스케어유통업체',       'Health Care Distributors',                  (select id from sectors where code='HEALTHCARE_PROVIDERS')),
  ('HEALTHCARE_FACILITIES',  '헬스케어시설',           'Health Care Facilities',                    (select id from sectors where code='HEALTHCARE_PROVIDERS')),
  ('HEALTHCARE_MANAGED',     '관리형헬스케어',         'Managed Health Care',                       (select id from sectors where code='HEALTHCARE_PROVIDERS')),
  -- Health Care Technology
  ('HEALTHCARE_TECH_L4',     '헬스케어기술',           'Health Care Technology',                    (select id from sectors where code='HEALTHCARE_TECH')),
  -- Banks
  ('DIVERSIFIED_BANKS',      '다각화은행',             'Diversified Banks',                         (select id from sectors where code='BANKS_IND')),
  ('REGIONAL_BANKS',         '지역은행',               'Regional Banks',                            (select id from sectors where code='BANKS_IND')),
  -- Thrifts & Mortgage Finance
  ('THRIFTS_MORTGAGE_L4',    '저축기관및모기지금융',   'Thrifts & Mortgage Finance',                (select id from sectors where code='THRIFTS_MORTGAGE')),
  -- Diversified Financial Services
  ('DIV_FINANCIAL_SVCS_L4',  '다각화금융서비스',       'Diversified Financial Services',            (select id from sectors where code='DIV_FINANCIAL_SVCS')),
  ('MULTI_SECTOR_HOLDINGS',  '복합섹터지주',           'Multi-Sector Holdings',                     (select id from sectors where code='DIV_FINANCIAL_SVCS')),
  ('SPECIALIZED_FINANCE',    '특화금융',               'Specialized Finance',                       (select id from sectors where code='DIV_FINANCIAL_SVCS')),
  ('COMMERCIAL_FINANCE',     '상업금융',               'Commercial & Residential Mortgage Finance', (select id from sectors where code='DIV_FINANCIAL_SVCS')),
  ('TRANSACTION_PROCESSING', '거래처리및결제',         'Transaction & Payment Processing Services', (select id from sectors where code='DIV_FINANCIAL_SVCS')),
  -- Consumer Finance
  ('CONSUMER_FINANCE_L4',    '소비자금융',             'Consumer Finance',                          (select id from sectors where code='CONSUMER_FINANCE')),
  -- Capital Markets
  ('ASSET_MANAGEMENT',       '자산운용및수탁',         'Asset Management & Custody Banks',          (select id from sectors where code='CAPITAL_MARKETS')),
  ('INVESTMENT_BANKING',     '투자은행및중개',         'Investment Banking & Brokerage',            (select id from sectors where code='CAPITAL_MARKETS')),
  ('DIVERSIFIED_CAPITAL',    '다각화자본시장',         'Diversified Capital Markets',               (select id from sectors where code='CAPITAL_MARKETS')),
  ('FINANCIAL_EXCHANGES',    '금융거래소및데이터',     'Financial Exchanges & Data',                (select id from sectors where code='CAPITAL_MARKETS')),
  -- Mortgage REITs
  ('MORTGAGE_REITS_L4',      '모기지리츠',             'Mortgage Real Estate Investment Trusts (REITs)', (select id from sectors where code='MORTGAGE_REITS')),
  -- Insurance
  ('INSURANCE_BROKERS',      '보험중개업체',           'Insurance Brokers',                         (select id from sectors where code='INSURANCE_IND')),
  ('LIFE_HEALTH_INSURANCE',  '생명및건강보험',         'Life & Health Insurance',                   (select id from sectors where code='INSURANCE_IND')),
  ('MULTI_LINE_INSURANCE',   '복합보험',               'Multi-line Insurance',                      (select id from sectors where code='INSURANCE_IND')),
  ('PROPERTY_CASUALTY',      '손해보험',               'Property & Casualty Insurance',             (select id from sectors where code='INSURANCE_IND')),
  ('REINSURANCE',            '재보험',                 'Reinsurance',                               (select id from sectors where code='INSURANCE_IND')),
  -- Automobile Components
  ('AUTO_PARTS',             '자동차부품및장비',       'Automotive Parts & Equipment',              (select id from sectors where code='AUTO_COMPONENTS')),
  ('TIRES_RUBBER',           '타이어및고무',           'Tires & Rubber',                            (select id from sectors where code='AUTO_COMPONENTS')),
  -- Automobiles
  ('AUTOMOBILE_MFG',         '자동차제조',             'Automobile Manufacturers',                  (select id from sectors where code='AUTOMOBILES')),
  ('MOTORCYCLE_MFG',         '오토바이제조',           'Motorcycle Manufacturers',                  (select id from sectors where code='AUTOMOBILES')),
  -- Household Durables
  ('CONSUMER_ELECTRONICS',   '소비자가전',             'Consumer Electronics',                      (select id from sectors where code='HOUSEHOLD_DURABLES')),
  ('HOME_FURNISHINGS',       '홈퍼니싱및피트니스',     'Home Furnishings & Fixtures',               (select id from sectors where code='HOUSEHOLD_DURABLES')),
  ('HOMEBUILDING',           '주택건설',               'Homebuilding',                              (select id from sectors where code='HOUSEHOLD_DURABLES')),
  ('HOUSEHOLD_APPLIANCES',   '가정용기기',             'Household Appliances',                      (select id from sectors where code='HOUSEHOLD_DURABLES')),
  ('HOUSEWARES',             '가정용품',               'Housewares & Specialties',                  (select id from sectors where code='HOUSEHOLD_DURABLES')),
  -- Leisure Products
  ('LEISURE_PRODUCTS_L4',    '레저용품',               'Leisure Products',                          (select id from sectors where code='LEISURE_PRODUCTS')),
  -- Textiles Apparel & Luxury Goods
  ('APPAREL_ACCESSORIES',    '의류액세서리및사치품',   'Apparel Accessories & Luxury Goods',        (select id from sectors where code='TEXTILES_APPAREL')),
  ('FOOTWEAR',               '신발',                   'Footwear',                                  (select id from sectors where code='TEXTILES_APPAREL')),
  ('TEXTILES',               '섬유',                   'Textiles',                                  (select id from sectors where code='TEXTILES_APPAREL')),
  -- Hotels Restaurants & Leisure
  ('CASINOS_GAMING',         '카지노및게임',           'Casinos & Gaming',                          (select id from sectors where code='HOTELS_RESTAURANTS')),
  ('HOTELS_RESORTS',         '호텔리조트및크루즈',     'Hotels Resorts & Cruise Lines',             (select id from sectors where code='HOTELS_RESTAURANTS')),
  ('LEISURE_FACILITIES',     '레저시설',               'Leisure Facilities',                        (select id from sectors where code='HOTELS_RESTAURANTS')),
  ('RESTAURANTS',            '레스토랑',               'Restaurants',                               (select id from sectors where code='HOTELS_RESTAURANTS')),
  -- Diversified Consumer Services
  ('EDUCATION_SVCS',         '교육서비스',             'Education Services',                        (select id from sectors where code='DIVERSIFIED_CONSUMER')),
  ('SPECIALIZED_CONSUMER',   '전문소비자서비스',       'Specialized Consumer Services',             (select id from sectors where code='DIVERSIFIED_CONSUMER')),
  -- Distributors
  ('DISTRIBUTORS_L4',        '유통업체',               'Distributors',                              (select id from sectors where code='DISTRIBUTORS')),
  -- Broadline Retail
  ('BROADLINE_RETAIL_L4',    '광범위소매',             'Broadline Retail',                          (select id from sectors where code='BROADLINE_RETAIL')),
  -- Specialty Retail
  ('APPAREL_RETAIL',         '의류소매',               'Apparel Retail',                            (select id from sectors where code='SPECIALTY_RETAIL')),
  ('COMPUTER_ELECTRONICS_RETAIL','컴퓨터전자소매',     'Computer & Electronics Retail',             (select id from sectors where code='SPECIALTY_RETAIL')),
  ('HOME_IMPROVEMENT_RETAIL','주택개선소매',           'Home Improvement Retail',                   (select id from sectors where code='SPECIALTY_RETAIL')),
  ('OTHER_SPECIALTY_RETAIL', '기타전문소매',           'Other Specialty Retail',                    (select id from sectors where code='SPECIALTY_RETAIL')),
  ('AUTOMOTIVE_RETAIL',      '자동차소매',             'Automotive Retail',                         (select id from sectors where code='SPECIALTY_RETAIL')),
  ('HOMEFURNISHING_RETAIL',  '홈퍼니싱소매',           'Homefurnishing Retail',                     (select id from sectors where code='SPECIALTY_RETAIL')),
  -- Beverages
  ('BREWERS',                '맥주',                   'Brewers',                                   (select id from sectors where code='BEVERAGES')),
  ('DISTILLERS',             '증류주및와인',           'Distillers & Vintners',                     (select id from sectors where code='BEVERAGES')),
  ('SOFT_DRINKS',            '청량음료',               'Soft Drinks & Non-alcoholic Beverages',     (select id from sectors where code='BEVERAGES')),
  -- Food Products
  ('AGRICULTURAL_PRODUCTS',  '농산물및농업용품',       'Agricultural Products & Services',          (select id from sectors where code='FOOD_PRODUCTS')),
  ('PACKAGED_FOODS',         '포장식품및육류',         'Packaged Foods & Meats',                    (select id from sectors where code='FOOD_PRODUCTS')),
  -- Tobacco
  ('TOBACCO_L4',             '담배',                   'Tobacco',                                   (select id from sectors where code='TOBACCO')),
  -- Food & Staples Retailing
  ('DRUG_RETAIL',            '약품소매',               'Drug Retail',                               (select id from sectors where code='FOOD_STAPLES_RETAIL')),
  ('FOOD_DISTRIBUTORS',      '식품유통업체',           'Food Distributors',                         (select id from sectors where code='FOOD_STAPLES_RETAIL')),
  ('FOOD_RETAIL',            '식품소매',               'Food Retail',                               (select id from sectors where code='FOOD_STAPLES_RETAIL')),
  ('CONSUMER_STAPLES_DIST',  '필수소비재유통및소매',   'Consumer Staples Distribution & Retail',    (select id from sectors where code='FOOD_STAPLES_RETAIL')),
  -- Household Products
  ('HOUSEHOLD_PRODS_L4',     '가정용품',               'Household Products',                        (select id from sectors where code='HOUSEHOLD_PRODS')),
  -- Personal Care Products
  ('PERSONAL_CARE_L4',       '개인용품',               'Personal Care Products',                    (select id from sectors where code='PERSONAL_CARE_PRODS')),
  -- Diversified Telecommunication Services
  ('ALT_CARRIERS',           '대안통신사업자',         'Alternative Carriers',                      (select id from sectors where code='DIV_TELECOM')),
  ('INTEGRATED_TELECOM',     '종합통신서비스',         'Integrated Telecommunication Services',     (select id from sectors where code='DIV_TELECOM')),
  -- Wireless Telecommunication Services
  ('WIRELESS_TELECOM_L4',    '무선통신서비스',         'Wireless Telecommunication Services',       (select id from sectors where code='WIRELESS_TELECOM')),
  -- Media
  ('ADVERTISING',            '광고',                   'Advertising',                               (select id from sectors where code='MEDIA')),
  ('BROADCASTING',           '방송',                   'Broadcasting',                              (select id from sectors where code='MEDIA')),
  ('CABLE_SATELLITE',        '케이블및위성',           'Cable & Satellite',                         (select id from sectors where code='MEDIA')),
  ('PUBLISHING',             '출판',                   'Publishing',                                (select id from sectors where code='MEDIA')),
  -- Entertainment
  ('MOVIES_ENTERTAINMENT',   '영화및엔터테인먼트',     'Movies & Entertainment',                    (select id from sectors where code='ENTERTAINMENT')),
  ('LIVE_ENTERTAINMENT',     '공연및이벤트',           'Interactive Home Entertainment',            (select id from sectors where code='ENTERTAINMENT')),
  -- Interactive Media & Services
  ('INTERACTIVE_MEDIA_L4',   '인터랙티브미디어및서비스','Interactive Media & Services',             (select id from sectors where code='INTERACTIVE_MEDIA')),
  -- Aerospace & Defense
  ('AEROSPACE_DEFENSE_L4',   '항공우주및방산',         'Aerospace & Defense',                       (select id from sectors where code='AEROSPACE_DEFENSE')),
  -- Building Products
  ('BUILDING_PRODUCTS_L4',   '건축자재',               'Building Products',                         (select id from sectors where code='BUILDING_PRODUCTS')),
  -- Construction & Engineering
  ('CONSTRUCTION_ENG_L4',    '건설및엔지니어링',       'Construction & Engineering',                (select id from sectors where code='CONSTRUCTION_ENG')),
  -- Electrical Equipment
  ('ELECTRICAL_COMPONENTS',  '전기부품및장비',         'Electrical Components & Equipment',         (select id from sectors where code='ELECTRICAL_EQUIPMENT')),
  ('HEAVY_ELECTRICAL_EQUIP', '중전기장비',             'Heavy Electrical Equipment',                (select id from sectors where code='ELECTRICAL_EQUIPMENT')),
  -- Industrial Conglomerates
  ('INDUSTRIAL_CONGLOM_L4',  '복합기업',               'Industrial Conglomerates',                  (select id from sectors where code='INDUSTRIAL_CONGLOM')),
  -- Machinery
  ('CONSTRUCTION_MACHINERY', '건설농업기계트럭',       'Construction Farm Machinery & Heavy Trucks',(select id from sectors where code='MACHINERY')),
  ('INDUSTRIAL_MACHINERY',   '산업기계및부품',         'Industrial Machinery & Supplies & Components', (select id from sectors where code='MACHINERY')),
  -- Trading Companies & Distributors
  ('TRADING_COMPANIES',      '무역회사및유통업체',     'Trading Companies & Distributors',          (select id from sectors where code='TRADING_DISTRIBUTION')),
  -- Commercial Services & Supplies
  ('COMMERCIAL_PRINTING',    '상업인쇄',               'Commercial Printing',                       (select id from sectors where code='COMMERCIAL_SVCS')),
  ('ENVIRONMENTAL_SVCS',     '환경및설비서비스',       'Environmental & Facilities Services',       (select id from sectors where code='COMMERCIAL_SVCS')),
  ('OFFICE_SVCS_SUPPLIES',   '사무서비스및용품',       'Office Services & Supplies',                (select id from sectors where code='COMMERCIAL_SVCS')),
  ('DIVERSIFIED_SUPPORT',    '다각화지원서비스',       'Diversified Support Services',              (select id from sectors where code='COMMERCIAL_SVCS')),
  ('SECURITY_ALARM',         '보안및경보서비스',       'Security & Alarm Services',                 (select id from sectors where code='COMMERCIAL_SVCS')),
  -- Professional Services
  ('HUMAN_RESOURCES',        '인적자원및고용서비스',   'Human Resource & Employment Services',      (select id from sectors where code='PROFESSIONAL_SVCS')),
  ('RESEARCH_CONSULTING',    '조사및컨설팅서비스',     'Research & Consulting Services',            (select id from sectors where code='PROFESSIONAL_SVCS')),
  ('DATA_INFRASTRUCTURE',    '데이터인프라',           'Data & Infrastructure Technology Services', (select id from sectors where code='PROFESSIONAL_SVCS')),
  -- Air Freight & Logistics
  ('AIR_FREIGHT_L4',         '항공화물및물류',         'Air Freight & Logistics',                   (select id from sectors where code='AIR_FREIGHT')),
  -- Passenger Airlines
  ('PASSENGER_AIRLINES_L4',  '여객항공사',             'Passenger Airlines',                        (select id from sectors where code='PASSENGER_AIRLINES')),
  -- Marine Transportation
  ('MARINE_TRANSPORT_L4',    '해상운송',               'Marine Transportation',                     (select id from sectors where code='MARINE_TRANSPORT')),
  -- Ground Transportation
  ('GROUND_TRANSPORT_L4',    '지상운송',               'Ground Transportation',                     (select id from sectors where code='GROUND_TRANSPORT')),
  -- Transportation Infrastructure
  ('AIRPORT_SVCS',           '공항서비스',             'Airport Services',                          (select id from sectors where code='TRANSPORT_INFRA')),
  ('HIGHWAYS_RAILTRACKS',    '고속도로및철도',         'Highways & Railtracks',                     (select id from sectors where code='TRANSPORT_INFRA')),
  ('MARINE_PORTS',           '해항및서비스',           'Marine Ports & Services',                   (select id from sectors where code='TRANSPORT_INFRA')),
  -- Chemicals
  ('COMMODITY_CHEMICALS',    '기초화학품',             'Commodity Chemicals',                       (select id from sectors where code='CHEMICALS')),
  ('DIVERSIFIED_CHEMICALS',  '다각화화학',             'Diversified Chemicals',                     (select id from sectors where code='CHEMICALS')),
  ('FERTILIZERS_AGRI_CHEM',  '비료및농업화학품',       'Fertilizers & Agricultural Chemicals',      (select id from sectors where code='CHEMICALS')),
  ('INDUSTRIAL_GASES',       '산업용가스',             'Industrial Gases',                          (select id from sectors where code='CHEMICALS')),
  ('SPECIALTY_CHEMICALS',    '특수화학품',             'Specialty Chemicals',                       (select id from sectors where code='CHEMICALS')),
  -- Construction Materials
  ('CONSTRUCTION_MAT_L4',    '건설자재',               'Construction Materials',                    (select id from sectors where code='CONSTRUCTION_MATERIALS')),
  -- Containers & Packaging
  ('METAL_GLASS_CONTAINERS', '금속유리용기',           'Metal Glass & Plastic Containers',          (select id from sectors where code='CONTAINERS_PACKAGING')),
  ('PAPER_PACKAGING',        '종이및플라스틱포장',     'Paper & Plastic Packaging Products & Materials', (select id from sectors where code='CONTAINERS_PACKAGING')),
  -- Metals & Mining
  ('ALUMINUM',               '알루미늄',               'Aluminum',                                  (select id from sectors where code='METALS_MINING')),
  ('DIVERSIFIED_METALS',     '다각화금속및광업',       'Diversified Metals & Mining',               (select id from sectors where code='METALS_MINING')),
  ('COPPER',                 '구리',                   'Copper',                                    (select id from sectors where code='METALS_MINING')),
  ('GOLD',                   '금',                     'Gold',                                      (select id from sectors where code='METALS_MINING')),
  ('PRECIOUS_METALS',        '귀금속및광물',           'Precious Metals & Minerals',                (select id from sectors where code='METALS_MINING')),
  ('SILVER',                 '은',                     'Silver',                                    (select id from sectors where code='METALS_MINING')),
  ('STEEL',                  '철강',                   'Steel',                                     (select id from sectors where code='METALS_MINING')),
  -- Paper & Forest Products
  ('FOREST_PRODUCTS',        '산림및목재제품',         'Forest Products',                           (select id from sectors where code='PAPER_FOREST')),
  ('PAPER_PRODUCTS',         '종이제품',               'Paper Products',                            (select id from sectors where code='PAPER_FOREST')),
  -- Energy Equipment & Services
  ('DRILLING',               '시추',                   'Oil & Gas Drilling',                        (select id from sectors where code='ENERGY_EQUIP_SVCS')),
  ('OIL_GAS_EQUIP_SVCS',     '석유가스장비및서비스',   'Oil & Gas Equipment & Services',            (select id from sectors where code='ENERGY_EQUIP_SVCS')),
  -- Oil Gas & Consumable Fuels
  ('OIL_GAS_EXPLORATION',    '석유가스탐사및생산',     'Oil & Gas Exploration & Production',        (select id from sectors where code='OIL_GAS')),
  ('OIL_GAS_INTEGRATED',     '종합석유가스',           'Integrated Oil & Gas',                      (select id from sectors where code='OIL_GAS')),
  ('OIL_GAS_MIDSTREAM',      '석유가스미드스트림',     'Oil & Gas Refining & Marketing',            (select id from sectors where code='OIL_GAS')),
  ('OIL_GAS_STORAGE',        '석유가스저장및운송',     'Oil & Gas Storage & Transportation',        (select id from sectors where code='OIL_GAS')),
  ('COAL_CONSUMABLE_FUELS',  '석탄및소모연료',         'Coal & Consumable Fuels',                   (select id from sectors where code='OIL_GAS')),
  -- Electric Utilities
  ('ELEC_UTILITIES_L4',      '전기유틸리티',           'Electric Utilities',                        (select id from sectors where code='ELEC_UTILITIES')),
  -- Gas Utilities
  ('GAS_UTILITIES_L4',       '가스유틸리티',           'Gas Utilities',                             (select id from sectors where code='GAS_UTILITIES')),
  -- Multi-Utilities
  ('MULTI_UTILITIES_L4',     '복합유틸리티',           'Multi-Utilities',                           (select id from sectors where code='MULTI_UTILITIES')),
  -- Water Utilities
  ('WATER_UTILITIES_L4',     '수도유틸리티',           'Water Utilities',                           (select id from sectors where code='WATER_UTILITIES')),
  -- Independent Power Producers & Energy Traders
  ('INDEP_POWER_L4',         '독립발전사업자',         'Independent Power Producers & Energy Traders', (select id from sectors where code='INDEP_POWER')),
  -- Renewable Electricity
  ('RENEWABLE_ELEC_L4',      '신재생전기',             'Renewable Electricity',                     (select id from sectors where code='RENEWABLE_ELEC')),
  -- Diversified REITs
  ('DIV_REITS_L4',           '다각화리츠',             'Diversified REITs',                         (select id from sectors where code='DIV_REITS')),
  -- Industrial REITs
  ('INDUSTRIAL_REITS_L4',    '산업용리츠',             'Industrial REITs',                          (select id from sectors where code='INDUSTRIAL_REITS')),
  -- Hotel & Resort REITs
  ('HOTEL_RESORT_REITS_L4',  '호텔및리조트리츠',      'Hotel & Resort REITs',                      (select id from sectors where code='HOTEL_RESORT_REITS')),
  -- Office REITs
  ('OFFICE_REITS_L4',        '오피스리츠',             'Office REITs',                              (select id from sectors where code='OFFICE_REITS')),
  -- Health Care REITs
  ('HEALTHCARE_REITS_L4',    '헬스케어리츠',           'Health Care REITs',                         (select id from sectors where code='HEALTHCARE_REITS')),
  -- Residential REITs
  ('RESIDENTIAL_REITS_L4',   '주거용리츠',             'Residential REITs',                         (select id from sectors where code='RESIDENTIAL_REITS')),
  -- Retail REITs
  ('RETAIL_REITS_L4',        '리테일리츠',             'Retail REITs',                              (select id from sectors where code='RETAIL_REITS')),
  -- Specialized REITs
  ('SPECIALIZED_REITS_L4',   '특수리츠',               'Specialized REITs',                         (select id from sectors where code='SPECIALIZED_REITS')),
  -- Real Estate Management & Development
  ('DIVERSIFIED_REAL_ESTATE','다각화부동산활동',        'Diversified Real Estate Activities',        (select id from sectors where code='RE_MGMT_DEV_IND')),
  ('REAL_ESTATE_DEV',        '부동산개발',             'Real Estate Development',                   (select id from sectors where code='RE_MGMT_DEV_IND')),
  ('REAL_ESTATE_OPERATING',  '부동산운영회사',         'Real Estate Operating Companies',           (select id from sectors where code='RE_MGMT_DEV_IND')),
  ('REAL_ESTATE_SVCS',       '부동산서비스',           'Real Estate Services',                      (select id from sectors where code='RE_MGMT_DEV_IND'))
) as t(code, name, name_en, parent_id)
on conflict (code) do nothing;

-- ────────────────────────────────────────────
-- 5. gics_yfinance_map 테이블 생성
--    yfinance industry 문자열 → GICS L4 sector_id 매핑
-- ────────────────────────────────────────────

create table if not exists gics_yfinance_map (
  yfinance_industry text primary key,
  sector_id         int  not null references sectors(id)
);

alter table gics_yfinance_map enable row level security;

create policy "gics_yfinance_map_select_authenticated"
  on gics_yfinance_map for select
  to authenticated
  using (true);

-- 초기 시드: 주요 yfinance industry → GICS L4 매핑
-- (yfinance industry 문자열과 GICS Sub-Industry명이 다른 경우 수동 등록)
insert into gics_yfinance_map (yfinance_industry, sector_id)
select yf_ind, s.id
from (values
  ('Semiconductor Manufacturing',        'SEMI_MFG'),
  ('Semiconductor Equipment & Materials','SEMI_EQUIP_L4'),
  ('Semiconductors',                     'SEMI_MFG'),
  ('Application Software',               'APPLICATION_SW'),
  ('Software - Application',             'APPLICATION_SW'),
  ('Software - Infrastructure',          'SYSTEMS_SW'),
  ('Information Technology Services',    'IT_CONSULTING'),
  ('IT Services',                        'IT_CONSULTING'),
  ('Internet Content & Information',     'INTERACTIVE_MEDIA_L4'),
  ('Internet Retail',                    'BROADLINE_RETAIL_L4'),
  ('Electronic Components',              'ELECTRONIC_COMPONENTS'),
  ('Electronic Gaming & Multimedia',     'LIVE_ENTERTAINMENT'),
  ('Consumer Electronics',               'CONSUMER_ELECTRONICS'),
  ('Communication Equipment',            'COMM_EQUIP_L4'),
  ('Telecom Services',                   'INTEGRATED_TELECOM'),
  ('Wireless Telecommunication Services','WIRELESS_TELECOM_L4'),
  ('Drug Manufacturers - General',       'PHARMA_L4'),
  ('Drug Manufacturers - Specialty & Generic', 'PHARMA_L4'),
  ('Biotechnology',                      'BIOTECH_L4'),
  ('Medical Devices',                    'HEALTHCARE_EQUIP_L4'),
  ('Medical Instruments & Supplies',     'HEALTHCARE_SUPPLIES'),
  ('Health Information Services',        'HEALTHCARE_TECH_L4'),
  ('Managed Care',                       'HEALTHCARE_MANAGED'),
  ('Diagnostics & Research',             'LIFE_SCIENCES_L4'),
  ('Banks - Diversified',                'DIVERSIFIED_BANKS'),
  ('Banks - Regional',                   'REGIONAL_BANKS'),
  ('Capital Markets',                    'ASSET_MANAGEMENT'),
  ('Asset Management',                   'ASSET_MANAGEMENT'),
  ('Insurance - Diversified',            'MULTI_LINE_INSURANCE'),
  ('Insurance - Life',                   'LIFE_HEALTH_INSURANCE'),
  ('Insurance - Property & Casualty',    'PROPERTY_CASUALTY'),
  ('Auto Manufacturers',                 'AUTOMOBILE_MFG'),
  ('Auto Parts',                         'AUTO_PARTS'),
  ('Specialty Retail',                   'OTHER_SPECIALTY_RETAIL'),
  ('Apparel Retail',                     'APPAREL_RETAIL'),
  ('Home Improvement Retail',            'HOME_IMPROVEMENT_RETAIL'),
  ('Restaurants',                        'RESTAURANTS'),
  ('Hotels & Motels',                    'HOTELS_RESORTS'),
  ('Beverages - Non-Alcoholic',          'SOFT_DRINKS'),
  ('Beverages - Alcoholic',              'DISTILLERS'),
  ('Packaged Foods',                     'PACKAGED_FOODS'),
  ('Farm Products',                      'AGRICULTURAL_PRODUCTS'),
  ('Tobacco',                            'TOBACCO_L4'),
  ('Broadcasting',                       'BROADCASTING'),
  ('Entertainment',                      'MOVIES_ENTERTAINMENT'),
  ('Advertising Agencies',               'ADVERTISING'),
  ('Aerospace & Defense',                'AEROSPACE_DEFENSE_L4'),
  ('Industrial Machinery',               'INDUSTRIAL_MACHINERY'),
  ('Specialty Chemicals',                'SPECIALTY_CHEMICALS'),
  ('Steel',                              'STEEL'),
  ('Copper',                             'COPPER'),
  ('Gold',                               'GOLD'),
  ('Silver',                             'SILVER'),
  ('Oil & Gas E&P',                      'OIL_GAS_EXPLORATION'),
  ('Oil & Gas Integrated',               'OIL_GAS_INTEGRATED'),
  ('Oil & Gas Refining & Marketing',     'OIL_GAS_MIDSTREAM'),
  ('Oil & Gas Equipment & Services',     'OIL_GAS_EQUIP_SVCS'),
  ('Oil & Gas Drilling',                 'DRILLING'),
  ('Utilities - Regulated Electric',     'ELEC_UTILITIES_L4'),
  ('Utilities - Regulated Gas',          'GAS_UTILITIES_L4'),
  ('Utilities - Diversified',            'MULTI_UTILITIES_L4'),
  ('Utilities - Renewable',              'RENEWABLE_ELEC_L4'),
  ('REIT - Industrial',                  'INDUSTRIAL_REITS_L4'),
  ('REIT - Office',                      'OFFICE_REITS_L4'),
  ('REIT - Retail',                      'RETAIL_REITS_L4'),
  ('REIT - Residential',                 'RESIDENTIAL_REITS_L4'),
  ('REIT - Healthcare Facilities',       'HEALTHCARE_REITS_L4'),
  ('REIT - Specialty',                   'SPECIALIZED_REITS_L4'),
  ('REIT - Diversified',                 'DIV_REITS_L4'),
  ('REIT - Hotel & Motel',               'HOTEL_RESORT_REITS_L4'),
  ('REIT - Mortgage',                    'MORTGAGE_REITS_L4')
) as t(yf_ind, sector_code)
join sectors s on s.code = t.sector_code
on conflict (yfinance_industry) do nothing;

-- ────────────────────────────────────────────
-- 6. kr_sector_map DROP
-- ────────────────────────────────────────────

drop table if exists kr_sector_map;

-- ────────────────────────────────────────────
-- 7. get_sector_breadcrumb DB Function (신규)
--    주어진 sector_id의 L1까지 조상 경로 반환
-- ────────────────────────────────────────────

create or replace function get_sector_breadcrumb(
  p_sector_id int
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  -- 인증 확인
  if auth.uid() is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  -- sector_id 존재 여부 확인
  if not exists (select 1 from sectors where id = p_sector_id) then
    raise exception 'sector not found: %', p_sector_id
      using errcode = 'no_data_found';
  end if;

  -- CTE로 조상 경로 역추적 (재귀 쿼리)
  with recursive breadcrumb as (
    -- 시작: 주어진 섹터
    select id, code, name, name_en, parent_id, level
      from sectors
     where id = p_sector_id

    union all

    -- 재귀: 부모로 올라감
    select s.id, s.code, s.name, s.name_en, s.parent_id, s.level
      from sectors s
      join breadcrumb b on s.id = b.parent_id
  )
  select json_agg(
    json_build_object(
      'id',      id,
      'code',    code,
      'name',    name,
      'name_en', name_en,
      'level',   level
    )
    order by level asc
  )
  into v_result
  from breadcrumb;

  return coalesce(v_result, '[]'::json);
end;
$$;

-- ────────────────────────────────────────────
-- 8. get_or_recommend_stock_sector 함수 업데이트
--    p_naver_industry 제거, p_yfinance_sector/p_yfinance_industry 추가
--    kr_sector_map 참조 제거, yfinance 단일 경로로 통일
-- ────────────────────────────────────────────

-- 구 시그니처 DROP (p_naver_industry 포함)
drop function if exists public.get_or_recommend_stock_sector(text, text, text, text, text);

create or replace function get_or_recommend_stock_sector(
  p_ticker             text,
  p_market             text,
  p_name               text,
  p_currency           text,
  p_yfinance_sector    text default null,   -- yfinance sector 반환값 (예: "Technology")
  p_yfinance_industry  text default null    -- yfinance industry 반환값 (예: "Semiconductor Manufacturing")
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_id        uuid;
  v_sector_id       int;
  v_sector_code     text;
  v_sector_name     text;
  v_sector_name_en  text;
  v_sector_level    int;
  v_stock_name      text;
  v_currency        text;
  v_is_active       boolean;
  v_is_new          boolean := false;
  v_created_at      timestamptz;
  v_rec_sector_id   int;
  v_rec_sector_code text;
  v_rec_sector_name text;
  v_rec_name_en     text;
  v_rec_level       int;
  v_l1_sector_id    int;
begin
  -- 인증 확인
  if auth.uid() is null then
    raise exception 'authentication required'
      using errcode = 'insufficient_privilege';
  end if;

  -- market 유효성 검사
  if p_market not in ('KR', 'US', 'CRYPTO') then
    raise exception 'invalid market: %', p_market
      using errcode = 'check_violation';
  end if;

  -- 기존 종목 조회
  select id, sector_id, name, currency, is_active, created_at
    into v_stock_id, v_sector_id, v_stock_name, v_currency, v_is_active, v_created_at
    from stocks
   where ticker = p_ticker
     and market = p_market;

  if v_stock_id is null then
    v_is_new     := true;
    v_stock_name := p_name;
    v_currency   := p_currency;
    v_is_active  := true;
    v_created_at := now();
  end if;

  -- 섹터 자동 추천
  if p_market = 'CRYPTO' then
    -- 암호화폐: CRYPTO 고정
    select id into v_rec_sector_id from sectors where code = 'CRYPTO';

  else
    -- KR/US 공통: yfinance 단일 경로
    if p_yfinance_industry is not null then
      -- 1. gics_yfinance_map 조회
      select sector_id into v_rec_sector_id
        from gics_yfinance_map
       where yfinance_industry = p_yfinance_industry;

      -- 2. 매핑 없으면 sectors.name_en 직접 매칭 (L4 → L3 → L2 순)
      if v_rec_sector_id is null then
        select id into v_rec_sector_id
          from sectors
         where name_en ilike p_yfinance_industry
           and level in (4, 3, 2)
         order by level desc
         limit 1;
      end if;
    end if;

    -- 3. 여전히 매핑 실패 시 yfinance_sector(L1)로 폴백
    if v_rec_sector_id is null and p_yfinance_sector is not null then
      select id into v_rec_sector_id
        from sectors
       where name_en ilike p_yfinance_sector
         and level = 1;

      -- L1도 없으면 code 매칭 시도 (기존 GICS 코드 직접 전달)
      if v_rec_sector_id is null then
        select id into v_rec_sector_id
          from sectors
         where code = upper(replace(p_yfinance_sector, ' ', '_'))
           and level = 1;
      end if;
    end if;
  end if;

  -- 기존 종목에 sector_id가 없고 추천 가능하면 추천 섹터 사용
  if v_sector_id is null then
    v_sector_id := v_rec_sector_id;
  end if;

  -- 기존(또는 확정) 섹터 정보 조회
  if v_sector_id is not null then
    select code, name, name_en, level
      into v_sector_code, v_sector_name, v_sector_name_en, v_sector_level
      from sectors
     where id = v_sector_id;
  end if;

  -- 추천 섹터 정보 조회
  if v_rec_sector_id is not null then
    if v_rec_sector_id = v_sector_id then
      v_rec_sector_code := v_sector_code;
      v_rec_sector_name := v_sector_name;
      v_rec_name_en     := v_sector_name_en;
      v_rec_level       := v_sector_level;
    else
      select code, name, name_en, level
        into v_rec_sector_code, v_rec_sector_name, v_rec_name_en, v_rec_level
        from sectors
       where id = v_rec_sector_id;
    end if;
  end if;

  return json_build_object(
    'id',           coalesce(v_stock_id, gen_random_uuid()),
    'ticker',       p_ticker,
    'name',         v_stock_name,
    'market',       p_market,
    'currency',     v_currency,
    'is_active',    v_is_active,
    'sector_id',    v_sector_id,
    'recommended_sector',
      case when v_rec_sector_id is not null then
        json_build_object(
          'id',      v_rec_sector_id,
          'code',    v_rec_sector_code,
          'name',    v_rec_sector_name,
          'name_en', v_rec_name_en,
          'level',   v_rec_level
        )
      else null end,
    'is_new',       v_is_new,
    'created_at',   v_created_at
  );
end;
$$;

-- ────────────────────────────────────────────
-- 9. list_memos 함수 업데이트
--    섹터 필터에 계층 탐색 로직 추가
--    (L1/L2 지정 시 하위 종목 포함)
-- ────────────────────────────────────────────

-- 구 시그니처 DROP
drop function if exists public.list_memos(date, date, uuid[], boolean, boolean, int[], boolean, int, int);

create or replace function list_memos(
  p_from               date    default null,
  p_to                 date    default null,
  p_stock_ids          uuid[]  default null,
  p_trade_events_only  boolean default false,
  p_news_only          boolean default false,
  p_sector_ids         int[]   default null,
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
  v_user_id        uuid := auth.uid();
  v_memos          json;
  v_total          int;
  v_expanded_sector_ids int[];
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

  -- 섹터 필터 계층 탐색:
  -- 지정된 sector_ids + 그 하위 모든 sector_ids를 재귀로 확장
  -- L1 지정 시 하위 L2~L4까지 포함
  if p_sector_ids is not null and cardinality(p_sector_ids) > 0 then
    with recursive sector_tree as (
      -- 기준: 지정된 섹터들
      select id from sectors where id = any(p_sector_ids)
      union all
      -- 재귀: 하위 섹터
      select s.id
        from sectors s
        join sector_tree st on s.parent_id = st.id
    )
    select array_agg(id) into v_expanded_sector_ids from sector_tree;
  else
    v_expanded_sector_ids := p_sector_ids;
  end if;

  -- 전체 카운트
  select count(distinct m.id)
    into v_total
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
     -- 섹터 필터: 메모에 직접 연결된 섹터 OR 종목의 sector_id 계층 포함
     and (
       p_no_links = true
       or v_expanded_sector_ids is null
       or cardinality(v_expanded_sector_ids) = 0
       or exists (
         -- 메모에 직접 연결된 섹터 (어떤 레벨이든)
         select 1 from memo_sectors mse
          where mse.memo_id  = m.id
            and mse.sector_id = any(v_expanded_sector_ids)
       )
       or exists (
         -- 메모에 연결된 종목의 sector_id가 확장된 섹터 트리에 포함
         select 1
           from memo_stocks ms
           join stocks st on st.id = ms.stock_id
          where ms.memo_id = m.id
            and st.sector_id = any(v_expanded_sector_ids)
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
         or v_expanded_sector_ids is null
         or cardinality(v_expanded_sector_ids) = 0
         or exists (
           select 1 from memo_sectors mse
            where mse.memo_id  = m.id
              and mse.sector_id = any(v_expanded_sector_ids)
         )
         or exists (
           select 1
             from memo_stocks ms
             join stocks st on st.id = ms.stock_id
            where ms.memo_id = m.id
              and st.sector_id = any(v_expanded_sector_ids)
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
