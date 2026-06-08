# 프론트엔드 구현 내역

## 새로 만든 컴포넌트

- `app/components/CascadingSectorPicker.tsx` — L1~L4 cascading 섹터 선택 공통 컴포넌트
  - `PickerLevel`: 단일 레벨 칩 목록 (단일 선택용, export)
  - `CascadingSectorPicker`: 단일 선택 모드 (StockDetailSheet 섹터 보정용, export)
  - `CascadingSectorMultiPicker`: 복수 선택 모드 (MemoEditScreen 섹터 연결용, export)
  - `MultiSectorChip`: 선택 토글 + 펼침 버튼이 분리된 칩 (내부용)
  - `MultiPickerLevel`: 복수 선택 모드용 레벨 컴포넌트 (내부용)

## 수정한 파일

- `app/screens/MemoEditScreen.tsx` — 섹터 연결 UI를 L1~L4 cascading multi-select로 교체
  - 기존: `getSectors({ level: 1 })`로 L1만 로드 후 단순 토글 칩
  - 변경: `CascadingSectorMultiPicker` 사용, L1~L4 어느 레벨이든 선택 가능
  - 상태: `selectedSectorIds: number[]` → `selectedSectors: Sector[]`로 변경 (level 메타 포함)
  - 편집 모드 초기화: `memo_sectors → Sector[]` 변환 시 level 포함
  - 선택된 섹터 목록을 레벨 배지(L1/L2/L3/L4)와 함께 상단에 표시, 개별 제거 가능
  - `selectedSectorIds`: `useMemo`로 파생 계산 → RPC `p_sector_ids` 파라미터에 사용

- `app/components/StockDetailSheet.tsx` — 내부 `CascadingPicker` / `PickerLevel` 제거, 공통 컴포넌트로 교체
  - `getSectors` import 제거 (공통 컴포넌트 내부에서 처리)
  - `CascadingSectorPicker` import 추가
  - cascading 관련 내부 컴포넌트 ~160줄 제거

- `app/components/MemoCard.tsx` — 섹터 칩 레벨 표시
  - L1 섹터: 기존대로 `{name}` 표시
  - L2~L4 섹터: `L{level} {name}` 형태로 레벨 배지 접두어 추가

- `app/components/MemoFilter.tsx` — 주석 추가 (코드 변경 없음)
  - [019] 필터 동작 확인 주석: RPC의 두 경로 합산으로 L3/L4 직접 연결 메모도 L2 id 필터로 잡힘을 명시

## UI 레퍼런스 매핑

별도 UI 레퍼런스 파일 없음. 기존 StockDetailSheet의 CascadingPicker 패턴을 기반으로 복수 선택 모드를 설계.

## 특이사항

### CascadingSectorMultiPicker 설계 결정
- 선택(onToggle)과 펼침(onExpand)을 분리: 선택 영역 탭 → 선택 토글, ▼ 버튼 탭 → 하위 레벨 펼침
- Accordion 방식: L1 하나만 펼칠 수 있고 다른 L1 탭 시 이전 L1 접힘
- 선택과 펼침은 독립적: L1 펼치지 않고도 L1 선택 가능, L1 선택 없이 L2만 선택 가능
- 각 레벨 indent 표시: `paddingLeft + borderLeftColor`로 계층 시각화

### MemoFilter 변경 없음 확인
- 이슈 설명대로 RPC 측에서 두 경로(종목 경로 + 직접 연결 경로)를 OR 합산하므로
- sectorIds에 L2 id만 보내는 현재 구조 유지로 L3/L4 직접 연결 메모도 필터에 포함됨
- 프론트 코드 변경 불필요, 동작 확인 주석만 추가

### TypeScript 타입
- `MemoEditScreen`: `selectedSectors: Sector[]`로 관리, `selectedSectorIds`는 `useMemo`로 파생
- `Sector` 타입 재활용 (app/types/sector.ts), `any` 미사용
- `expandBtnTextActive` 스타일에 `color: '#003ec7'`을 적용하여 단일/복수 모드 일관성 유지
