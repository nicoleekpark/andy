# App Store 제출 전: AI 허락, 약속 1, App Privacy

*English: [pre-submission-privacy.md](pre-submission-privacy.md). 두 문서는 함께 고친다.*

상태: **결정됐고 만들어짐** (오너, 2026-10-14. 맨 끝의 Final choice 참고). 전날 밤에 선택지로 초안을 썼다.
TestFlight는 이것 때문에 막히지 않는다. App Review는 막힌다.

## 이 문서가 있는 이유

빌드 5의 app-store-reviewer 점검에서 세 가지가 나왔다.

1. **Apple은 알리는 것뿐 아니라 허락을 받으라고 한다.** App Review Guideline
   5.1.2(i), 2026-10-14에 확인한 현재 원문:
   > "You must clearly disclose where personal data will be shared with third
   > parties, including with third-party AI, and obtain explicit permission
   > before doing so."

   Andy는 처음 읽는 노트부터 그 사람의 노트를 Anthropic과 OpenAI로 보낸다.
   지금 앱 안에서는 아무것도 그렇게 말하지 않고, 아무것도 묻지 않는다. 개인정보
   페이지에는 적혀 있지만 링크는 "명시적인 허락"이 아니다. **이것이 막는 문제다.**
2. **약속 1이 쓰인 그대로는 사실이 아니다.** "Your notes are never shared, sold or
   shown to anyone"은 개인정보 페이지의 처리자 표와 함께 있을 수 있어야 한다.
   STYLE.md의 규칙은 약속에는 코드가 보장하는 것만 적는다는 것이다.
3. App Store Connect의 **App Privacy 설문**은 코드가 실제로 하는 일과 맞아야
   한다. 적게 신고해도, 많이 신고해도 안 된다.

## 실제로 폰 밖으로 나가는 것 (코드 기준, 2026-10-14)

| 시점 | 함수 | 받는 곳 | 무엇을 |
|---|---|---|---|
| Read it (음성 또는 Write) | `extraction.fromTranscript` | Anthropic | 노트의 글, 그리고 사람 페이지에서 시작했으면 그 사람의 이름 |
| Let Andy read it (사진) | `extraction.fromPhoto` | Anthropic | 줄인 사진. Andy는 저장하지 않음 |
| 저장되는 모든 노트 | `embeddings.embedNotes` (예약 작업) | OpenAI | 노트의 글 |
| Ask Andy | `search.recall` → `answer.write` | OpenAI (검색용 질문), Anthropic (질문과 찾은 노트) | |
| 팔로업 초안 | `followUp.draft` → `email.write` | Anthropic | 이 사람의 노트 |
| 말하기, 폰 안 모델을 쓸 수 없을 때 | iOS 음성 인식 | Apple | iOS가 처리하는 대로의 음성 |
| 캘린더 | — | 아무 데도 안 감. 폰 안에서 맞춤 | |

처음 두 줄, Read it과 사진은 사람이 Andy에서 **가장 먼저 하는 일**에서 일어난다.
첫 노트보다 늦게 묻는 허락은 이미 보낸 뒤에 묻는 셈이다.

## 결정 1: Andy가 어디서 묻는가

| | A. 첫 노트 전에 한 번 **(추천)** | B. AI 기능마다 처음 쓸 때 | C. 로그인 화면의 한 줄 |
|---|---|---|---|
| 사람에게 보이는 것 | 로그인 후 홈 전에 화면 하나. 무엇을, 누가, 왜 읽는지와 **Allow**, **Not now** | Read it, Ask, Photo, Draft를 처음 누를 때 시트 | 로그인 버튼 아래 "계속하면 …에 동의합니다" |
| 5.1.2(i) 충족 | 예. 보내기 전에 명시적으로 묻는다 | 예. 요청마다 명시적이다 | 약하다. 로그인 때의 묵시적 동의는 "명시적"이 배제하는 것이다 |
| CLAUDE.md "권한은 쓰는 시점에" | 대체로. iOS 권한은 아니지만 Andy를 처음 쓰기 전에 묻는다 | 완전히 | 아니다 |
| 번거로움 | 계정당 한 번, 화면 하나 | 시트가 최대 네 번, 첫 번째는 노트 쓰는 도중에 끼어든다 | 없음 |
| Not now 이후 | Andy는 그대로 열린다: 사람들, 손으로 쓴 노트, 오프라인 복사본. **Read it**은 기다리고 다시 묻는다. Ask, Photo, Draft도 같다. 허락하기 전까지 노트는 사실도 검색도 없이 저장된다 | 물어본 기능만 기다린다 | — |
| 만드는 비용 | 화면 하나, `users`에 필드 하나, 액션 다섯 개에 서버 검사, 철회용 Settings | 같은 서버 검사에 시트 네 개 | 문구만 |

추천: **A**. 서버에 저장한다(`users.aiAllowedAt`, 추가 필드). 그래서 모든 기기에서
같고 계정과 함께 사라진다. 지키는 쪽은 화면이 아니라 서버다. 위의 액션 다섯 개는
값이 생기기 전까지 `ConvexError`로 거절한다. 화면에서만 하는 검사는
`security-reviewer`가 막는 종류다. **Settings → What Andy sends**에서 철회하면
새 호출이 멈출 뿐, 이미 읽은 노트를 지우지는 않는다.

A의 문구 초안 (Voice: remember, never collect. "data" 금지):

> **Before Andy reads your first note**
>
> To turn what you say or photograph into notes, and to find them again when
> you ask, Andy sends the words, and photos you choose, to two services:
> **Anthropic (Claude)** reads them, and **OpenAI** makes them searchable.
> They use them only to do this for you, and don't train on them.
>
> Calendar names never leave this phone. Andy never sends anything to the
> people you write about.
>
> **Allow** · Not now · [What Andy sends](privacy page)

## 결정 2: 약속 1

규칙: 모든 단어가 코드가 이미 보장하는 것이어야 한다.

| | 문구 | 메모 |
|---|---|---|
| a **(추천)** | **Only you.** Your notes are never sold or shown to anyone. Andy sends them only to the services that read them for you. | 지금 사실이다. "only to"는 처리자 표가 보장하고, 다음 화면이 그 이름을 밝힌다 |
| b | **Only you.** Only you can see your notes. They are never sold, and are read only to do what you ask. | 더 짧지만, 누가 읽는지 말하지 않는 "read"는 개인정보 페이지에 기댄다 |
| c | **Only you.** Your notes are never sold or shown to anyone. Anthropic and OpenAI read them for Andy, and nowhere else. | 가장 명시적이다. 약속에 회사 이름 두 개는 스토어 소개에 무겁다 |

약속 1은 네 곳에 있고, 함께 바꿔야 한다.
- `STYLE.md` → Andy's promises
- `dev/design/privacy.html`
- `dev/design/positioning.html`
- `dev/design/story.html`

`dev-reports/positioning.dev.md`는 지난 결정의 기록이라 그대로 둔다.

## 결정 3: App Privacy 설문 (답안 초안)

Apple이 말하는 "수집(Collected)"은 폰 밖으로 보내져서 요청에 답하는 데 걸리는
시간보다 오래 보관되는 것을 뜻한다.

| Apple의 분류 | 신고? | 사람과 연결 | 추적 | 목적 | 이유 |
|---|---|---|---|---|---|
| Contact Info → Email Address | 예 | 예 | 아니오 | App Functionality | Clerk 로그인 |
| Contact Info → Name | 예 | 예 | 아니오 | App Functionality | Sign in with Apple에서 공유한 경우 |
| User Content → Other User Content | 예 | 예 | 아니오 | App Functionality | 노트와 사실. Convex에 저장되고 Anthropic, OpenAI로 보내짐 |
| User Content → Photos or Videos | 예 | 예 | 아니오 | App Functionality | 사람 사진은 저장된다. 노트 사진은 Anthropic으로 보내지고 그쪽이 악용 점검용으로 보관할 수 있으니, 다투기보다 신고한다 |
| User Content → Audio Data | **아니오** | — | — | — | Andy는 음성을 보내지 않는다. Apple의 음성 서비스는 Apple의 것이지 Andy의 것이 아니다 |
| Identifiers → User ID | 예 | 예 | 아니오 | App Functionality | Convex와 Clerk 계정 id |
| Contacts, Location, Health, Browsing, Search History, Purchases | 아니오 | | | | 읽지 않거나 폰에 남는다(캘린더) |
| Usage Data, Diagnostics | **아니오** | | | | `package.json`에 분석·크래시 SDK 없음 (2026-10-14 확인). 하나라도 추가되면 다시 확인 |

"추적에 쓰이는 데이터": **없음**. 외부 AI는 "Other User Content"에서 App
Functionality 목적의 서비스 제공자 공유로 밝히며, Apple은 이를 추적으로 보지 않는다.

## 함께 발견했지만 여기서 정하지 않은 것

- **개인정보 페이지에 아직 `[contact email]`이 있다.** 제출 전에 실제 주소여야 한다.
- **5.1.1(i)는 처리방침이 처리자도 "같거나 동등한 보호"를 한다고 확인하기를 원한다.**
  지금 페이지는 무엇을 받는지와 학습하지 않는다는 것만 말한다. 한 문장이면 된다.
  예: "Each is bound by terms that protect what it receives at least as well as
  this policy does." 오너가 그들의 약관이 그렇게 말한다고 확인한 뒤에만 넣는다.
- **앱 수준의 privacy manifest가 없다** (`app.json`의 `ios.privacyManifests`).
  Expo 모듈들이 각자 가지고 있고 빌드 5가 통과했으니, 알려진 실패가 아니라 확인할
  일이다. 빌드 5에 대한 Apple의 ITMS-91053 메일이 있는지 본다.
- 아직 남은 것: Clerk `pk_live` 인스턴스, Anthropic 콘솔의 비용 확인.

## A + a를 고르면, 만드는 슬라이스

1. 서버: `users.aiAllowedAt` (추가 필드), `account.allowAi` / `withdrawAi`,
   값이 생기기 전까지 액션 다섯 개가 거절, 테스트 포함 (`security-reviewer`).
2. 로그인 뒤 화면, 기다리는 상태들(Read it, Ask, Photo, Draft),
   Settings → What Andy sends (`code-reviewer`, `design-system-auditor`).
3. 약속 1을 네 곳 모두에, 개인정보 페이지의 문장과 이메일. 문서만.

## Final choice

오너, 2026-10-14. #175, #176, #177, #178에서 만들어짐 (모두 머지됨).

**결정 1: A. Apple의 ChatGPT 흐름과 비교한 뒤 고쳤다.**
- **절대 저절로 묻지 않는다.** 실행할 때 묻지 않는다. 시트는 사람이 읽는 기능을
  누를 때만 뜬다: Let Andy read it, 사진, Ask, 팔로업 초안.
- **Not now는 서버에 기억된다** (`users.aiDeclinedAt`). 그래서 거절한 사람은 직접
  그 기능들을 누르지 않는 한 다시 묻지 않는다. Allow가 지우고, Stop sending이 다시
  기록한다.
- **지키는 쪽은 서버다.** 모든 AI 액션에서 `requireAiAllowed`가 돌고, 임베딩 작업은
  허락하지 않은 사람의 노트를 건너뛴다. 서버는 `aiAllowedAt`만 보므로 거절 기록이
  무언가를 허락하는 일은 없다.
- **시트는 Apple 방식으로 그린다.** *"Let Andy read your notes?"*와 줄 세 개:
  - Reads what you write
  - Anthropic and OpenAI: *"Read it only to do this for you. They don't
    train on it, and delete it within 30 days."* (두 회사의 API 정책으로 확인함.
    "저장하지 않는다"는 zero-data-retention 계약이 있어야 해서 출시 후 과제)
  - Stays yours

  그 아래 Privacy policy 링크, Allow, Not now.
- **Save as written**은 거절해도 노트를 남기는 방법이다. App Review는 AI 없이도
  핵심 기능이 되기를 기대하기 때문이다.
  - Write 화면은 맨 위 한 줄 **About**으로 시작한다. #165의 결정을 다시 연 것이다.
  - 거절한 사람에게는 Save as written이 주 버튼이고, 아무것도 읽지 않는다.
  - 저장된 사람이 이미 그 이름이면, 읽은 노트와 똑같이 review에서 누구인지 묻는다.
- **Settings → What Andy sends**에서 허락하거나 멈추고, **Privacy policy**는 항상 있다.
- 모두 `aiPermission` 스위치 뒤에 있다. 프로덕션에는 빌드 6이 모든 폰에 깔릴 때까지
  꺼진 줄이 있어서 빌드 4, 5는 영향을 받지 않는다.

**결정 2: a.** *"Only you. Your notes are never sold or shown to anyone.
Andy sends them only to the services that read them for you."* STYLE.md와
처리방침에 들어갔다.

**결정 3: 위의 답안 초안을 그대로 쓴다.** 제출할 때 App Store Connect에 입력하고,
그때 코드와 다시 대조한다.

**그 밖에 정한 것.**
- **연락처:** `hello.andyapp@gmail.com`, 전용 메일함 (선택지 B).
- **처리방침에 적힌 개발자:** Eunkyung Park. App Store Connect의 판매자 이름과 같다.
- **처리방침**은 `docs/privacy/index.html`이고, Settings와 시트에서 연결된다
  (`src/constants/links.ts`).
- **출시 시장: 미국만** (오너, 2026-10-15). 처리방침은 미국 기준으로 판단한다.
  한국(개인정보보호법)이나 EU(GDPR)에 내려면 먼저 국외 이전 문단이 필요하다:
  받는 곳, 나라, 항목, 목적, 보관 기간. App Store Connect → Pricing and
  Availability에서 미국만 고른다.

**이제부터의 순서.**
1. 프로덕션에 `npx convex deploy`. 스위치 줄은 이미 들어가 있다.
2. 빌드 6.
3. 빌드 6이 모든 폰에 깔리면: 프로덕션의 `aiPermission` 줄을 지우고, GitHub
   Pages를 켜고(`main` → `/docs`), 처리방침의 날짜를 넣는다.
4. App Store Connect에서: 처리방침 URL, 연락처, App Privacy 답변, 판매 국가를
   미국으로.
