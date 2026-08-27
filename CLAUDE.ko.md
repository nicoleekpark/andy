# CLAUDE.md (한국어 번역본)

## 프로젝트

"Andy" — Expo(React Native) + Convex 앱. 음성 노트 → Claude가 추출한 구조화된 프로필 → 시맨틱 리콜 검색, Siri 단축어, 홈 위젯. 전체 스코프: `PROJECT_SCOPE.md` 참고.

## 스택 & 명령어

- 프론트엔드: Expo + TypeScript. `npm start` (= `expo start --dev-client`) — 이 앱은 Expo Go에서 실행되지 않으므로 그냥 `expo start`는 선택지가 아님.
- 백엔드: Convex (로컬은 `npx convex dev`, 배포는 `npx convex deploy`). `convex dev`를 켜둘 것 — `convex codegen`은 타입만 재생성하고 `auth.config.ts`나 스키마를 **배포에 적용하지 않음.**
- 테스트: `npm run test` — 러너 두 개를 순차 실행: jest(`src/`, RN 컴포넌트) 후 vitest(`convex/**/*.test.ts`, convex-test). Convex 함수는 jest로 테스트할 수 없음, `convex/_generated/ai/guidelines.md` 참고. 개별 실행: `npm run test:rn`, `npm run test:convex`.
- 린트/타입체크: `npm run lint` (커밋 전 반드시 통과해야 함)
- 빌드: `npm run build:ios` (EAS 클라우드, 약 8분) 후 `npm run ios:install`. 로컬 `npx expo run:ios`는 **이 머신에서 동작하지 않음** — Expo SDK 57이 Swift 6.3을 요구하고, 그건 Xcode 26.4+, 그건 macOS Tahoe를 요구함. `README.ko.md`의 명령어 표 참고.
- 제출: `eas submit --platform ios`, 단 `eas-release-checklist` 스킬과 `app-store-reviewer`를 거친 뒤에만.

## 작업 시작 전

가장 최근 `dev-reports/day-NN.dev.md`를 먼저 읽을 것. 코드에 없는 것 — 틀린 것으로 드러난 가정,
시도했다가 버린 접근, 검증된 것과 그냥 추정한 것의 구분, 어떤 작업을 시작하기 전에 무엇이 참이어야
하는지 — 이 거기 담겨 있음. `git log`와 그날의 `dev-reports/day-NN-commits.dev.md`는 **무엇이** 바뀌었는지 기록하고,
리포트는 **왜** 그리고 알아내는 데 무엇이 들었는지를 기록함.

## 협상 불가 규칙

- **커밋 하나당 기능 하나.** 가장 작은 단위의 동작하는, 테스트된 수직 슬라이스로. 관련 없는 변경사항을 한 커밋에 묶지 말 것. 모든 기능 요청에 `small-commit-flow` 스킬을 사용 — 이 워크플로를 그때그때 즉흥적으로 만들지 말 것.
- **클라이언트 코드에서 Anthropic API를 절대 직접 호출하지 말 것.** Claude 호출은 전부 Convex `action`을 거쳐야 하고, API 키는 오직 Convex 대시보드 환경변수에만 존재.
- **`.env`, API 키, Convex 배포 키는 절대 커밋하지 말 것.**
- **기능을 "완료"라고 말하기 전에 테스트를 작성하거나 업데이트할 것.** 테스트 없음 = 완료 아님.
- **Convex 스키마 변경은 기본적으로 추가(additive)만.** 커밋 메시지에 마이그레이션 관련 설명 없이 필드를 삭제/이름 변경하지 말 것 — 이건 실제 유저 데이터(음성에서 파생된 개인 노트)라서, 실제로 중요하게 다뤄야 함(개인정보이기 때문).
- **연락처, 마이크, 캘린더, 사진 권한은 기능별 opt-in이지 앱 전체 단위가 아님.** 사용 시점에 요청할 것, 앱 실행 시점이 아니라.
- **SMS/문자 읽기나 Gmail 인박스 자동 읽기 쪽으로는 절대 개발하지 말 것.** 둘 다 이번 제출 버전의 스코프 밖임 (`PROJECT_SCOPE.md`의 Reality Checks 참고) — 어떤 작업이 이 둘 중 하나가 필요해 보이면, 우회 방법을 구현하지 말고 멈춰서 이슈로 알릴 것.
- **노트는 프로필 단위가 아니라 노트 단위로 인덱싱됨.** 모든 노트는 자기만의 임베딩과 선택적 `mentionedEntityIds[]` 배열을 가짐. 노트들을 하나의 프로필 단위 덩어리로 합치지 말 것 — 그러면 반드시 있어야 하는(Must-have) 크로스 프로필 멘션 검색이 깨짐.
- **예약된 로컬 알림 개수를 제한할 것.** iOS는 앱당 최대 64개까지만 대기 가능 — 앞으로 다가올 매칭된 캘린더 이벤트 약 20~25개에 대해서만 브리핑/넛지 쌍을 예약하고, 포그라운드 진입 시 갱신할 것. 모든 미래 이벤트에 대해 무조건 예약하지 말 것.
- **앱스토어 제출 관련 작업 전에는** `eas-release-checklist` 스킬을 실행하고 `app-store-reviewer` 서브에이전트를 호출할 것 — 둘 다 거치지 않고 제출하지 말 것.
- **문서는 영/한 쌍임 — 둘 다 고치거나 둘 다 안 고치거나.** `README.md` ↔ `README.ko.md`, `CLAUDE.md` ↔ `CLAUDE.ko.md`, `PROJECT_SCOPE.md` ↔ `PROJECT_SCOPE.ko.md`. "나중에 번역"이 아니라 **같은 변경 안에서** 쌍을 함께 고칠 것 — 이 파일들은 지시문으로 로드되고 합의된 스코프로 읽히므로, 낡은 쪽이 조용히 두 번째 잘못된 진실이 됨. 고친 뒤엔 정합성을 확인할 것 — `grep -c '^## '`, 표의 명령어 컬럼, 코드블록 개수를 비교(제목은 번역돼 있으므로 텍스트가 아니라 구조를 비교).

## 데이터 모델 참고

핵심 엔티티는 내부적으로 범용적으로 모델링할 것("contact"으로 하드코딩하지 말 것) — 같은 객체 타입이 사람, 클라이언트, 위탁 보호 동물을 모두 나타냄. 이 유연성을 유지할 것; 이건 의도된 스코프 결정이지 스코프 크립이 아님.

## 비주얼 디자인

화면을 만들기 전에 항상 `STYLE.md`를 확인할 것 — 색상 토큰, 타이포 역할, 그리고 하나의 시그니처 요소(Briefing 카드)는 이미 결정돼 있음. 화면마다 즉흥적으로 색상/폰트를 새로 만들지 말 것.

## 스코프 규율

`PROJECT_SCOPE.md`의 MoSCoW 목록이 V1의 합의된 경계선임. 세션 중 어떤 요청이 이미 있는 Must/Should Have를 벗어나는 것을 추가하려 한다면 — 새로운 연동, 새로운 채널, User Flow에 없는 새로운 화면 등 — 조용히 구현하지 말고 먼저 플래그를 걸고 물어볼 것. 좋은 의도의 스코프 크립도 결국 데드라인을 갉아먹음.

## Convex 함수 컨벤션

- 모든 인자는 Convex의 `v.*` validator로 검증할 것(이미 `schema.ts`에 쓰고 있는 패턴) — Zod 아님, 이건 REST API가 아님.
- 유저에게 보여줄 에러는 즉흥적인 `{ error: string }` 형태가 아니라 `ConvexError`를 쓸 것 — 확실하지 않으면 `docs-verifier`로 정확한 현재 패턴을 확인할 것, Convex의 에러 처리 방식은 버전별로 계속 바뀌어옴.
- `profiles`/`notes`/`metrics`/`calendarLinks`를 읽거나 쓰는 모든 함수는 `ctx.auth.getUserIdentity()`를 체크하고 인증된 유저의 id로 필터링해야 함 — 이건 `security-reviewer`의 첫 번째 차단 체크 항목이니, 게이트가 잡아주길 기대하지 말고 처음부터 맞게 짤 것.
- V1엔 수동 rate-limiting 인프라 없음 — Convex의 함수 호출 모델은 REST식 API 게이트웨이 레이트리밋이 필요 없음; 출시 후 실제로 남용이 문제가 될 때만 재검토.

## `.claude/rules/`에 대한 참고

나중에 여기에 경로 범위 규칙(path-scoped rule) 파일을 추가한다면, frontmatter에 `paths:`가 아니라 **`globs:`**를 쓸 것 — `paths:`는 문서화는 돼있지만 실제로 버그가 확인됨(스코핑 안 되고 그냥 전역으로 로드되거나, 버전에 따라 아예 무시됨). glob 패턴은 따옴표로 감쌀 것(`"**/*.ts"`, `**/*.ts` 아님). 추가한 뒤엔 `/memory`로 실제로 기대한 대로만 로드됐는지 확인하고 나서 믿을 것.

## 막혔을 때

여기 있는 워크플로 하나를 대화 중에 세 번 넘게 손으로 계속 수정하고 있다면, 그건 대화 안에서 계속 패치할 신호가 아니라 해당 skill 파일 자체를 고쳐야 한다는 신호임.
