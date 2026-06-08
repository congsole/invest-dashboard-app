# 프론트엔드 구현 내역

## 수정한 파일
- `app/components/MemoCard.tsx` — `buildChips` 함수에서 종목 칩 라벨을 `s.ticker`에서 `s.name`으로 변경

## 변경 상세

`MemoCard.tsx`의 `buildChips` 함수 내 종목 루프:

```ts
// 변경 전
chips.push({ entityType: 'stock', label: s.ticker, key: `stock-${s.stock_id}` });

// 변경 후
chips.push({ entityType: 'stock', label: s.name, key: `stock-${s.stock_id}` });
```

`MemoStock` 타입에 `name` 필드가 이미 정의되어 있어 타입 변경 없이 라벨만 교체했다.

## 특이사항
- `MemoStock` 타입(`app/types/memo.ts`)에 `name: string` 필드가 있으므로 추가 타입 변경 불필요
- market별 분기 로직은 원래 없었고, ticker를 그대로 사용하던 단일 경로였기 때문에 조건문 제거 없이 필드 참조만 교체
- 변경 범위: `MemoCard.tsx` 한 줄
