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
npm run reset-project      # 1회성: 기본 예시 라우트를 app-example/로 옮기고 app/을 비워서 시작 가능하게 함.
                           # 아직 안 했으면 Day 1 전에 실행할 것.
npm install
npx expo lint               # ESLint 아직 설정 안 됐으면 설정함 —
                           # small-commit-flow의 lint 단계가 Day 1부터 이게 되어 있어야 함
# Jest는 https://docs.expo.dev/develop/unit-testing/ 참고해서 설정 (아직 안 됐으면) —
# test-writer가 Day 1부터 동작하는 테스트 러너가 필요하니 건너뛰지 말 것
npx convex dev               # Convex 개발 배포를 시작하고 convex/_generated를 생성함
npx expo run:ios               # 개발 빌드를 빌드하고 실행함.
                           # `npx expo start` + Expo Go 아님 — 이 프로젝트는 커스텀 네이티브 모듈
                           # (Calendar, LocalAuthentication, Widgets)을 쓰는데 Expo Go 샌드박스는
                           # 이걸 지원 안 함. PROJECT_SCOPE.md의 Reality Checks 참고.
```

> **참고**: `create-expo-app`은 자체적으로 `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`을 자동 생성해서 버전별 Expo SDK 문서와 공식 Expo Claude 플러그인을 가리킴. 이 레포의 `CLAUDE.md`는 그것과 합칠 것(덮어쓰지 말고 이어붙이기) — `CLAUDE.md` 맨 위의 merge note 참고.

### 환경변수

Convex 대시보드에 설정 (서버사이드, Expo 앱에는 절대 넣지 않음):

```
ANTHROPIC_API_KEY=...
```

`.env.local`에 설정 (클라이언트에 노출돼도 안전한 것만):

```
EXPO_PUBLIC_CONVEX_URL=...
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

## 스크립트

```bash
npm run dev          # expo start
npm run test          # jest
npm run lint           # eslint + tsc --noEmit
npx convex deploy      # 백엔드 함수 배포
eas build --platform ios
eas submit --platform ios
```

## 커밋 컨벤션

커밋 하나당 작고, 동작하고, 테스트된 수직 슬라이스 하나. Conventional commits 형식(`feat:`, `fix:`, `chore:`). `.claude/skills/small-commit-flow/SKILL.md` 참고 — 이 레포에서 모든 기능 요청에 대해 Claude Code가 따라야 하는 기본 워크플로임.

## 앱스토어 제출 전

`.claude/skills/eas-release-checklist/SKILL.md`를 끝까지 실행하고, `eas submit` 전에 `app-store-reviewer` 서브에이전트한테 권한 문자열과 프라이버시 매니페스트를 체크시킬 것.

## Expo 참고 자료

[Expo 문서](https://docs.expo.dev/) · [Expo Router](https://docs.expo.dev/router/introduction) · [유닛 테스트 가이드](https://docs.expo.dev/develop/unit-testing/) · [ESLint/Prettier 가이드](https://docs.expo.dev/guides/using-eslint/)
