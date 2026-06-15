# 증권사 거래내역 자동 임포트 파이프라인

증권사 거래내역서를 파싱해 운영 Supabase `account_events`(+ 주식분할은 `corporate_actions`)에
적재하는 자동화. **코드와 데이터는 이 리포 밖에 있다** — 개인 거래내역 + RLS 우회 서비스키라
git에 올리지 않는다. 이 문서는 "그런 파이프라인이 외부에 존재한다"는 포인터다.

## 위치 (리포 밖, 홈 디렉토리)

| 증권사 | 폴더 | 입력 형식 | 비고 |
|--------|------|-----------|------|
| 토스증권 | `~/toss-import/` | PDF (거래내역서) | `pdftotext`로 텍스트 추출 |
| 삼성증권 | `~/samsung-import/` | xlsx (거래내역) | openpyxl 전용 venv 사용 |

각 폴더 구조: `inbox/`(여기에 파일을 떨군다) · `.work/`(파생물·로그) · `parse_*.py` ·
`push_*.py` · `import.sh` · `.env`(Supabase+Telegram) · `README.md`. 삼성은 `venv/` 추가.

> ~/Documents 안에 두면 macOS TCC가 launchd의 파일 접근을 "Operation not permitted"로
> 막기 때문에, 보호영역 밖인 홈 직하에 둔다.

## 동작 (launchd 자동 감시)

```
inbox/ 에 파일 추가
  → launchd(WatchPaths)가 import.sh 실행 (plist: ~/Library/LaunchAgents/com.investdashboard.{toss,samsung}-import.plist)
  → 파싱(parse_*.py) → .work/events.json
  → 적재(push_*.py): 이미 있는 external_ref는 건너뛰고 신규만 insert
  → 신규가 있으면 macOS 배너 + Telegram 알림
```
- 파생물은 감시 대상(`inbox/`) **밖**(`.work/`)에만 써서 자기 재실행 루프를 방지한다.
- 동시 실행 방지 디렉토리 락 + 5분 stale 락 자동 회수.
- 수동 실행: `~/{toss,samsung}-import/import.sh` · 로그: `tail -f ~/{...}-import/.work/import.log`

## 멱등성 (기간이 겹쳐도 안전)

각 거래에 **재발급·기간과 무관하게 동일한** `external_ref`를 부여하고, 적재 시 DB에 이미 있는
ref면 건너뛴다. 따라서 겹치는 명세서를 여러 개 떨궈도 **신규 거래만** 추가되고 중복은 안 쌓인다.

- **토스**: `"toss:" + md5(날짜|섹션|거래구분|종목|수량|거래대금|정산금액|단가|파일내출현순번)` — 날짜가
  키에 있어 같은 거래는 어느 명세서에서든 동일 ref. (구 `toss-pdf:{date}:{전역순번}` scheme은
  파일 추가 시 순번이 밀려 깨졌고, 내용 해시로 교체함.)
- **삼성**: `samsung:{날짜}:{거래번호}` — 거래번호가 삼성 원장의 날짜별 고유 시퀀스. 환전쌍은
  `:krw`/`:usd`, 배당 집계는 `:div:{ticker}:{통화}` 접미.

**한계:** 적재는 INSERT만(UPDATE 없음). 과거 정산 거래는 불변이라 무방하나, 기존 값 수정 목적의
재임포트는 동작하지 않는다. 또 앱 수동입력(`source='manual'`)과 임포트(`source='csv'`)는 서로
중복 검출하지 않으니, 수동 입력한 거래가 든 명세서는 임포트하지 말 것(이중 계상).

## 매핑 규칙 (사용자 승인)

대상 계정은 둘 다 **동일 대시보드 계정**(토스+삼성 합산). 자세한 거래구분→이벤트 매핑은 각 폴더의
`README.md`와 `parse_*.py` 상단 주석 참조. 요점:
- 매수/매도 → buy/sell, 환전 → KRW/USD deposit·withdraw 쌍, 배당 → dividend(원천징수세는 tax),
  입출금류 → deposit/withdraw, 주식분할 → `corporate_actions`(ratio=신주/구주).
- **종목 식별**: 토스는 종목코드/ISIN 제공(ISIN→심볼 수동 매핑 일부). **삼성은 종목코드가 없어**
  종목명→ticker 수동 매핑 테이블(`KR_MAP/US_MAP/US_PREFIX`). 새 종목은 "매핑 없음"으로 그 행만
  skip → 매핑 추가 후 재실행.

## 새 머신 셋업 (참고)

리포엔 코드가 없으므로, 새 머신에서는 위 폴더를 별도로 옮기고 `.env`(Supabase URL/서비스키,
Telegram 토큰)와 삼성 venv(openpyxl)를 재구성한 뒤, plist를
`launchctl bootstrap gui/$(id -u) <plist>`로 등록해야 한다.
