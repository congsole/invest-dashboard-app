# 프론트엔드 구현 내역

## 새로 만든 화면
- `app/screens/AuthScreen.tsx` — 로그인/회원가입 탭 전환 화면. 유효성 검사, 에러 메시지, 로딩 상태 포함.
- `app/screens/SettingsScreen.tsx` — 설정 화면. 로그아웃 버튼 및 확인 다이얼로그 포함.

## 새로 만든 컴포넌트
- 별도 공통 컴포넌트 없음 (이번 이슈 범위에서는 단순 화면 2개로 충분)

## 새로 만든 훅
- `app/hooks/useAuth.ts` — Supabase Auth 세션 구독 훅. 앱 시작 시 세션 복원, 인증 상태 변화 실시간 감지.

## 새로 만든 타입
- `app/types/auth.ts` — `AuthUser`, `Profile`, `AuthScreen` 타입 정의.

## 수정한 파일
- `app/App.tsx` — 전체 재작성. `useAuth` 훅으로 인증 상태에 따라 AuthScreen / SettingsScreen / 로딩 화면 분기.

## UI 레퍼런스 매핑
- `ui/` 디렉토리 없음 — PRD-001-auth.md의 화면 구성 명세를 직접 참조하여 구현

## 특이사항
- `KeyboardAvoidingView` + `ScrollView`로 키보드 올라올 때 폼이 가려지지 않도록 처리
- 이메일 중복, 잘못된 로그인 등 Supabase Auth 에러 메시지를 사용자 친화적 메시지로 변환 (`parseAuthError`)
- 로그아웃은 `Alert.alert`로 확인 다이얼로그 구현 (RN 네이티브 다이얼로그)
- 이번 이슈에서 메인 화면은 SettingsScreen으로 임시 대체. 추후 MainScreen 구현 시 App.tsx 수정 필요.
