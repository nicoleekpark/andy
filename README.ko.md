# Andy (한국어 번역본)

> 이 파일은 `README.md` 원본(영어)의 한국어 번역본입니다. 원본이 수정되면 이 파일도 함께 업데이트해야 합니다.

사람에 대해 음성으로 메모 → LLM이 검색 가능한 프로필로 구조화 → 자연어 검색, Siri 단축어, 홈 화면 위젯으로 나중에 회상.

전체 기능 스코프, 아키텍처, 빌드 계획은 [`PROJECT_SCOPE.md`](./PROJECT_SCOPE.md) 참고. Claude Code가 이 레포에서 어떻게 작업해야 하는지는 [`CLAUDE.md`](./CLAUDE.md) 참고.

## 스택

- Expo (React Native) + TypeScript
- Convex (데이터베이스, 백엔드 함수, 실시간 동기화, 벡터 검색, 파일 스토리지)
- Clerk (인증 — V1은 Apple Sign-In)
- Claude API (추출 + RAG 챗봇, Convex action에서만 서버사이드로 호출)
- expo-contacts, expo-audio(녹음), expo-speech-recognition(전사), expo-speech(Siri 응답용 TTS), expo-local-authentication(비밀번호/생체인증 앱 잠금)

## 기술 스택 결정 (이유, 그리고 함께 고려했던 대안들)

**프론트엔드 — Expo(React Native), Flutter나 네이티브 Swift/Kotlin이 아님.**
솔로 개발자가 진짜 크로스플랫폼 앱을 만드는 데 가장 빠른 경로고, 셋 중 AI 코드생성 생태계도 가장 큼 — Claude Code가 타이핑의 대부분을 담당하는 상황에서 중요한 지점. Flutter와 네이티브도 고려했지만 이번 특정 제약(솔로 개발자 1인, 촉박한 타임라인) 때문에 제외함; 네이티브가 플랫폼 완성도는 제일 좋지만 코드베이스 2개를 만드는 만큼 빌드 비용이 약 2배임.

**백엔드 — Convex, Supabase나 Firebase가 아님.**
셋 다 실시간 동기화 + 벡터 검색 + 서버리스 함수를 지원함. *이 프로젝트*에서의 결정적 요인:

- Convex는 스키마, 백엔드 함수, 클라이언트 타입을 하나의 TypeScript 코드베이스로 통일함 — AI 코딩 에이전트가 실수할 수 있는 표면적이 제일 작고, 촉박한 데드라인의 솔로 개발자한테 가장 빠르게 만들 수 있음.
- 네이티브 반응형 쿼리(실시간 동기화가 수동 배선 없이 자동)와, 이 앱에 필요한 규모의 네이티브 벡터 검색.
- 고려했으나 제외한 것들: **Supabase** — 더 이식성이 좋음(순수 Postgres, 방대한 SQL 인재풀, 진짜 관계형 조인)지만 실시간 구독과 Postgres RLS 정책을 손수 설정해야 하고, 여기가 바로 솔로/빠르게 움직이는 개발자가 가장 흔히 진짜 보안 버그를 만드는 지점임. **Firebase** — 오프라인 동기화가 업계 최고 수준이고 생태계가 가장 성숙하지만, 우리의 profile→notes→mentions 관계에 NoSQL 비정규화 오버헤드가 있고, 별도의 Cloud Functions 배포 파이프라인이 필요하고, 셀프호스팅이 안 됨(셋 중 락인이 가장 심함).

**인증 — Clerk, Convex Auth나 Auth0이 아님.**
Convex 공식 문서 자체가 Convex Auth를 베타라고 설명하고 프로덕션에는 Clerk이나 Auth0을 권장함. Clerk은 Convex와 공식 연동이 있고, 사전 제작된 Apple/Google 로그인 UI를 제공하며(화면을 직접 만들 필요 없음), 10~12일짜리 솔로 빌드에는 더 검증된 선택지임. **V1은 Apple Sign-In만 탑재** — Apple의 가이드라인 4.8은 다른 소셜 로그인을 하나라도 제공하면 Sign in with Apple도 동등하게 제공하도록 요구하기 때문에, 지금 Google을 추가하면 iOS 전용 V1에 아무 이득 없이 Apple Sign-In까지 의무적으로 따라옴. Google Sign-In은 실제로 의미 있어지는 시점인 Android 빌드와 함께 V1.1로 미룸.

## 셋업

```bash
# 완료됨: create-expo-app 데모 스캐폴드는 example/ 로 옮겨져 있고(참고용, 빌드·타입체크 대상 아님),
# 1회성 스크립트였던 reset-project 는 제거됨.
npm install
npx convex dev             # Convex 개발 배포를 시작하고 convex/_generated 를 생성함.
                           # 백엔드 작업 중에는 켜둔 채로 둘 것.
```

그다음 시뮬레이터에 빌드를 올린다 — 아래 **명령어** 절 참고. `npx expo run:ios`(로컬 네이티브
빌드)는 macOS Sequoia 에서 **동작하지 않는다.** 빌드는 EAS 를 거친다. 이유는 명령어 절에 적혀 있다.
```bash
```

> **참고**: `create-expo-app`은 자체적으로 `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`을 자동 생성해서 버전별 Expo SDK 문서와 공식 Expo Claude 플러그인을 가리킴. 이 레포의 `CLAUDE.md`는 그것과 합칠 것(덮어쓰지 말고 이어붙이기) — `CLAUDE.md` 맨 위의 merge note 참고.

### 환경변수

Convex 대시보드에 설정 (서버사이드, Expo 앱에는 절대 넣지 않음):

```
ANTHROPIC_API_KEY=...
```

`.env.local`에 설정 (클라이언트에 노출돼도 안전한 것만 — Metro 가 앱 번들에 그대로 인라인하므로
비밀은 절대 여기 두지 말 것):

```
EXPO_PUBLIC_CONVEX_URL=...
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=...
```

`.env.local` 은 gitignore 대상이라 내 머신에만 있다. 즉 **EAS 클라우드 빌드는 이 파일을 못 본다.**
같은 변수 두 개를 EAS 에도 등록해야 하며, 안 하면 빌드된 앱이 실행 즉시 throw 한다:

```bash
eas env:create --scope project --environment development \
  --name EXPO_PUBLIC_CONVEX_URL --visibility plaintext \
  --value "$(grep '^EXPO_PUBLIC_CONVEX_URL=' .env.local | cut -d= -f2-)"
```

## 폴더 구조

```
src/
  app/              # Expo Router 화면
  components/
  hooks/
  constants/
convex/             # schema.ts, functions (queries/mutations/actions), vector index config
.claude/
  agents/           # 서브에이전트 (test-writer, app-store-reviewer, docs-verifier, code-reviewer, security-reviewer)
  skills/           # small-commit-flow, eas-release-checklist, expo-native-extension-setup
.mcp.json           # Claude Code용 MCP 서버 (GitHub 등)
```

## 명령어

### 매일 쓰는 것

대부분의 작업은 이것만으로 된다. JS·TS 변경은 재빌드 없이 시뮬레이터에 즉시 반영된다.

| 명령어 | 언제 | 왜 |
| --- | --- | --- |
| `npm run dev` | **작업할 때마다 — 여기서 시작** | 양쪽을 한 번에 띄운다: `convex dev` 가 `convex/` 아래 변경을 배포에 올리고, `expo start --dev-client` 가 설치된 빌드에 JS 번들을 공급한다. 프로세스가 둘인 이유는 **앱이 두 곳에 있기 때문**이다 — 화면은 Mac, 백엔드는 Convex 클라우드. 서로를 모른다. 명령을 하나로 합친 이유는 **두 번째만 켜는 게 실제로 반복된 실수**이기 때문이다: `npm run lint` 와 `npm run test` 는 배포된 적 없는 백엔드 코드에서도 통과하므로, 앱이 아직 없는 함수를 부르고 **에러는 화면 버그처럼 보인다.** `-k` 로 둘이 같이 죽어서 절반만 켜진 상태가 생기지 않는다. |
| `npm start` | 드물게 — 아래 참고 | Expo 서버만. 그냥 `expo start` 가 아니라 `--dev-client` 인 이유는 이 앱이 Expo Go 에서 못 돌기 때문. |
| `npm run test` | 슬라이스를 끝났다고 하기 전 | 러너 두 개를 순서대로 돌린다 — `src/` 는 jest, `convex/` 는 vitest. Convex 함수는 jest 로 테스트할 수 없어서, 러너 하나만 돌리면 절반이 조용히 건너뛰어진다. |
| `npm run lint` | 커밋 전마다 | `expo lint convex src` 후 `tsc --noEmit` 을 두 번 — 루트 한 번, `convex/tsconfig.json` 으로 한 번. Convex 코드는 Node 가 아니라 V8 에서 도는데, Node 전용 전역이 섞여 들어간 걸 잡는 건 두 번째 검사뿐이다. |
| `npm run test:rn` / `npm run test:convex` | 실패 원인을 좁힐 때 | 러너 하나씩. |
| `npm run test:watch` / `npm run test:watch:convex` | 테스트를 쓰는 중 | 저장할 때마다 다시 돈다. 러너별로 하나씩 — 감시자 둘이 한 터미널을 못 쓴다. **둘 다 시뮬레이터를 건드리지 않는다**: jest는 가짜 React Native에 화면을 그리고, convex-test는 메모리 안의 가짜 DB로 백엔드 함수를 돌린다. 그래서 실제 앱에서만 나오는 버그(로그아웃 크래시, 배포 안 된 함수)는 둘 다 못 본다. 그게 하루 리포트의 QA 목록이 있는 이유다. |

> **`npm start` 만 쓰는 게 맞는 때.** 거의 없다 — 기본은 `npm run dev` 다. 다음 세 경우에만 값을 한다:
>
> 1. **`convex dev` 가 이미 다른 터미널에 켜져 있을 때.** 하나 더 켜면 감시자 둘이 같은 배포를 물게 된다. 그때는 Expo 쪽만 띄운다.
> 2. **일부러 배포하고 싶지 않을 때.** `convex/` 를 실험적으로 만지는 중이라 저장할 때마다 dev 배포에 올라가는 게 싫은 경우 — 아직 적용하고 싶지 않은 반쯤 쓴 스키마 변경 같은 것.
> 3. **문제를 가릴 때.** 뭔가 잘못됐는데 어느 쪽인지 모르겠으면 따로 띄워서 어느 쪽이 문제를 보고하는지 본다.
>
> ```bash
> npm start                 # JS 쪽만
> npx convex dev            # 백엔드만, 다른 터미널에서
> ```
>
> 이 셋 말고는, **JS 쪽만 켜는 것이 백엔드 변경이 조용히 배포에 안 닿는 경로**다. 앱이 아직 없는 함수를 부르고, 에러는 화면 버그처럼 보인다.

### 시뮬레이터에 빌드 올리기

**네이티브** 설정이 바뀔 때만 필요하다 — 새 네이티브 모듈, `app.json` 플러그인, 권한 문자열,
번들 ID. JS 변경에는 필요 없다.

| 명령어 | 언제 | 왜 |
| --- | --- | --- |
| `npm run build:ios` | 네이티브 설정 변경 후 | 약 8분, Expo 클라우드에서 빌드된다. **`npx expo run:ios` 는 쓸 수 없다**: Expo SDK 57 의 `expo-modules-jsi` 가 `weak let`(Swift 6.3)을 쓰는데, Swift 6.3 이 들어간 첫 릴리스가 Xcode 26.4 이고, 26.4 이상은 전부 macOS Tahoe 26.2+ 를 요구한다. 이 머신은 Sequoia 다. EAS 는 `macos-tahoe-26.5-xcode-26.6` 에서 빌드하므로 로컬 툴체인이 무관해진다. |
| `npm run ios:install` | 빌드가 끝난 뒤 | 내려받아 설치하고 실행까지 한다. `-- --simulator "iPhone 17 Pro"` 를 붙이면 기기 선택 프롬프트를 건너뛴다. |
| `npm run build:ios:device` | 실제 아이폰에서 테스트할 때 | 서명된 `.ipa` 를 만든다. 유료 Apple Developer 계정이 필요하다. `development` 프로파일은 시뮬레이터 전용이라 계정이 아예 필요 없다. |

> `npm run ios` / `npm run android` 는 Expo 가 만드는 로컬 네이티브 빌드다. `npm run ios` 는 이 머신에서 동작하지 않고(위 빌드 행 참고) V1 에 Android 빌드는 없다. `npm run build:ios` 를 쓸 것.

### Convex

| 명령어 | 언제 | 왜 |
| --- | --- | --- |
| `npx convex dev` | 백엔드 작업 중 | `convex/` 를 감시하며 푸시하고 `convex/_generated` 를 재생성한다. |
| `npm run db` | 실제로 뭐가 써졌는지 볼 때 | 배포 대시보드를 연다. Data 탭이 행이 써지는 즉시 갱신되는데, **아무것도 안 바뀌는 것이 성공인 검사**는 이걸로만 확인된다 — 같은 사람에 대한 두 번째 노트는 `notes` 를 한 행 늘리고 `profiles` 는 그대로 둬야 한다. Logs 탭에는 저장이 실패했을 때 서버 쪽 이유가 찍힌다. |
| `npx convex codegen` | `convex dev` 없이 `schema.ts` 를 고쳤을 때 | 생성 타입을 다시 만든다. 배포에 접속하므로 순수 로컬 작업은 아니다. |
| `npx convex env set NAME value` | 서버 측 비밀을 넣을 때 | 배포 환경변수. `ANTHROPIC_API_KEY` 가 있어도 되는 유일한 장소. |
| `npx convex env get NAME` | 변수 하나 확인할 때 | 이걸 쓸 것. **`npx convex env list` 는 쓰지 말 것** — 목록 형태는 API 키를 포함해 모든 값을 그대로 출력한다. |

### 돌아가는 앱 들여다보기

| 명령어 | 언제 | 왜 |
| --- | --- | --- |
| `xcrun simctl openurl booted "andy:///search"` | 아직 링크가 없는 화면에 들어갈 때 | **슬래시 세 개.** `andy://search` 는 `search` 를 URL 호스트로 해석하므로, `andy://profile/abc` 같은 중첩 경로는 에러 없이 조용히 홈 화면에 머문다. |
| `xcrun simctl io booted screenshot out.png` | 화면이 실제로 어떻게 보이는지 남길 때 | 말로 설명하는 것보다 빠르다. |

### 릴리스

| 명령어 | 언제 | 왜 |
| --- | --- | --- |
| `npx convex deploy` | 백엔드 변경을 프로덕션에 배포할 때 | 앱 빌드와 별개다. 둘은 독립적으로 배포된다. |
| `eas build --profile production --platform ios` | 릴리스 빌드 | 먼저 `eas-release-checklist` 스킬과 `app-store-reviewer` 서브에이전트를 돌릴 것. |
| `eas submit --platform ios` | App Store Connect 업로드 | 위 두 검사 없이는 절대 하지 말 것. |

## 커밋 컨벤션

커밋 하나당 작고, 동작하고, 테스트된 수직 슬라이스 하나. Conventional commits 형식(`feat:`, `fix:`, `chore:`). `.claude/skills/small-commit-flow/SKILL.md` 참고 — 이 레포에서 모든 기능 요청에 대해 Claude Code가 따라야 하는 기본 워크플로임.

## 앱스토어 제출 전

`.claude/skills/eas-release-checklist/SKILL.md`를 끝까지 실행하고, `eas submit` 전에 `app-store-reviewer` 서브에이전트한테 권한 문자열과 프라이버시 매니페스트를 체크시킬 것.

## Expo 참고 자료

[Expo 문서](https://docs.expo.dev/) · [Expo Router](https://docs.expo.dev/router/introduction) · [유닛 테스트 가이드](https://docs.expo.dev/develop/unit-testing/) · [ESLint/Prettier 가이드](https://docs.expo.dev/guides/using-eslint/)
