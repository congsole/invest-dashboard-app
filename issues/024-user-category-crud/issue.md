# [024] 사용자 카테고리 CRUD + 종목 관리

## 개요
사용자가 직접 카테고리를 생성하고 종목을 배정할 수 있는 기능을 구현한다. GICS에 없는 "2차전지", "AI반도체" 같은 테마 분류를 사용자 정의로 운용하기 위한 기반 작업이다.

- `user_categories` 테이블 (카테고리 마스터), `user_category_stocks` 테이블 (카테고리-종목 N:M 매핑) DDL + RLS 적용
- 카테고리 CRUD REST API 4개: 목록 조회, 생성, 수정(이름 변경), 삭제
- 카테고리 종목 관리 REST API 3개: 종목 목록 조회, 종목 추가, 종목 제거
- 카테고리 관리 화면 (카테고리 목록 + 이름 수정/삭제, 종목 편집)

이슈 025(메모-카테고리 연결)의 선행 이슈다.

## 참조 문서
- 커밋: 5872267 — [Docs] 기획 업데이트 (카테고리 기능 추가)
- 기획서: docs/planning/PRD-006-user-categories.md

## docs 변경 내역

### domain-model.md
- [추가] UserCategory 엔터티 — 사용자 정의 카테고리 마스터 (user_id, name, unique(user_id, name))
- [추가] UserCategoryStock junction 엔터티 — 카테고리-종목 N:M 매핑 (category_id PK+FK, stock_id PK+FK)
- [추가] 관계 2건: User 1:N UserCategory, UserCategory N:M Stock

### db-schema.md
- [추가] user_categories 테이블 — 플랫 구조 카테고리 마스터. UNIQUE(user_id, name), 인덱스 idx_user_categories_user_id. RLS: 본인만 허용.
- [추가] user_category_stocks 테이블 — 카테고리-종목 N:M junction. 복합 PK (category_id, stock_id), 각각 cascade FK, 인덱스 idx_user_category_stocks_stock_id. RLS: category_id 경유 user_categories.user_id 검증.
- [추가] ERD 관계 2건: auth.users→user_categories, user_categories→user_category_stocks, user_category_stocks→stocks

### api-spec.md
- [추가] UserCategory 도메인 신규 — 카테고리 목록 조회 (REST GET), 카테고리 생성 (REST POST), 카테고리 수정 (REST PATCH), 카테고리 삭제 (REST DELETE), 카테고리 종목 목록 조회 (REST GET), 카테고리에 종목 추가 (REST POST), 카테고리에서 종목 제거 (REST DELETE)

## 구현 현황
- [x] Supabase 구현
- [x] 백엔드 테스트
- [x] 프론트엔드 구현
