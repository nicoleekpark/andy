# Component names

One name for every screen and every part of one, so that a bug report, a design option, a QA row and a code review all point at the same thing. **Use these names, in English, whenever you refer to UI** — in chat, PRs, `QA.md`, dev reports, and agent output.

- **This file is the source of truth.** Names were settled on 2026-10-06 by walking the simulator screen by screen (the labelled screenshots and PDF are kept locally in `dev/design/screen-names/` — not committed, because they show test data).
- **Changing a name is a small PR to this file.** A slice that adds, removes or reshapes a part of a screen updates its rows here in the same PR. A new part gets a name here before it is talked about.
- The `설명` column is a Korean description for the team; the name column is what everyone says.
- Copy is a separate thing: what a person *reads* follows `STYLE.md` → Terminology. Names here follow the code's model (rule 10).
- Not yet aligned: the code's `testID`s predate this file (`people-results` here is `profile-results`). Aligning them is a separate refactor (`REFACTOR.md`).

## Naming rules

1. **lowercase-kebab-case**, one name per thing: `profile-row`.
2. **Parent first** — a part carries its component's name: `nav-bar-title`, `profile-row-name`.
3. **Slots by position**, for places that hold different things per screen: `nav-bar-action-right`.
4. **System controls by role**: `nav-bar-back` (the iOS back button, always the same job).
5. **States after two dashes**, on screens and on parts: `briefing-card--empty`, `remember-button--disabled`, `mic-button--listening`.
6. **Role, not look.** `-button` does something (`note-delete-button`, even when drawn as text); `-link` is a name inside content that opens a profile or a note; `-toggle` opens and closes; `-field` takes typing. Style names (`button-primary`) belong to the design system, not here.
7. **Not ours, say so**: `ios-` for the system (`ios-status-bar`, `ios-apple-sheet`), `expo-` for development-only tools (`expo-dev-menu`).
8. **Screens by what the person does there**: `sign-in`, `lock`, `connecting`, `home`, `record`, `review`, `profile`, `profile-edit`, `note`, `ask`, `draft`, `settings`.
9. **One name for every kind: `profile`**, never `person-`. Add a kind only where the screen really differs: `profile--person` has Draft a follow-up; `profile--animal` says "animal" and has none. The code knows `person` and `animal` (`entityType`); there is no `project`.
10. **Copy follows Terminology; names follow the code's model.** People read "person", "detail"; names use `profile`, `note`, `detail`, and `subject` *only* for who a note is about — so the email subject on the draft is `draft-email-subject-field`.

## Shared parts

These appear on most screens and mean the same thing everywhere.

| Name | 설명 |
|---|---|
| `ios-status-bar` | iOS 상태줄 (시간·배터리) — 앱 것이 아님 |
| `nav-bar` | 맨 위 줄 전체 (뒤로가기 · 제목 · 오른쪽 버튼)와 그 아래 가는 선 |
| `nav-bar-back` | iOS 뒤로가기 — 어느 화면이든 ‹ 아이콘만, 글자 없음 (2026-10-12, copy-build-4 #27/#37). VoiceOver는 "Back" |
| `nav-bar-title` | 맨 위 가운데 제목 |
| `nav-bar-action-right` | 맨 위 오른쪽 자리 — 화면마다 다름 (Settings, Edit) |
| `settings-button` | home 오른쪽 위 톱니바퀴(SF Symbol `gearshape`, 44pt). VoiceOver "Settings". 심볼이 없는 빌드에선 "Settings" 글자 |
| `expo-dev-menu` | 왼쪽 위 톱니 — 개발용 빌드에만 있음, 테스터 앱엔 없음 |
| `debug-panel` | record 화면 아래 개발용 진단 줄 — 테스터 빌드에서 숨길지 결정 필요 |
| `offline-copy-line` | 오프라인에서 폰의 사본을 보여줄 때 화면 맨 위 — "Offline — showing what Andy had at 3:40 PM." (home·프로필·노트·Ask 공통, 온라인이면 안 보임) |
| `note-source-label` / `-text` / `-field` / `-hint` | 노트 원문 (WHAT YOU SAID / WROTE) — 기록·리뷰·노트 화면 공통 |
| `note-details-label` / `note-detail` / `note-detail-field` / `note-details-add-button` | 기억할 내용 (WHAT TO REMEMBER) — 리뷰·노트 화면 공통 |
| `confirm-dialog` | Andy가 직접 그리는 확인 창 (가운데 카드 + 뒤 어둡게). 잠금 화면이 이 창까지 덮음 — iOS 시스템 알림 대신 (QA #51) |
| `confirm-dialog-title` / `-body` | 질문 한 줄 / 무엇이 일어나는지 |
| `confirm-dialog-action` | 할 일 버튼 — moss, 지우기 세 곳(노트·사람·계정)만 alert 빨강 |
| `confirm-dialog-cancel` | Cancel — 글씨만, 맨 아래 |

## Screens

Each screen lists its captured states, then the parts that belong to it (shared parts above are not repeated).

### `sign-in`

| Capture | State | 설명 |
|---|---|---|
| S2 | `sign-in` | 로그인 |
| S2b | `sign-in + ios-apple-sheet` | 로그인 — Apple 시스템 시트 (계정 줄은 가림) |

| Name | 설명 |
|---|---|
| `name-mark` | 실 한 가닥으로 쓴 andy — 끝은 아이콘의 고리 |
| `sign-in-tagline` | Remember what they told you. (Lora 이탤릭) |
| `sign-in-description` | 한 줄 설명 |
| `ios-apple-sign-in-button` | Apple 제공 버튼 — 모양·문구는 Apple 규정 |
| `ios-apple-sheet` | Apple이 띄우는 시트 전체 — 앱 것이 아님 |
| `ios-apple-sheet-app-name` | 여기 앱 이름이 소문자 "andy" — Apple 쪽 설정, 빌드 QA에서 확인 |
| `ios-apple-sheet-account` | Apple 계정 줄 (개인정보라 가림) |
| `ios-apple-sheet-close` | 닫기 |

### `lock`

| Capture | State | 설명 |
|---|---|---|
| S3 | `lock` | 잠금 (Face ID) |

| Name | 설명 |
|---|---|
| `lock-title` | Andy is locked. |
| `lock-body` | Face ID로 열라는 안내 |
| `unlock-button` | Face ID 다시 요청 |
| `lock-cover` | 잠겨 있거나 확인 중일 때 하던 화면 위를 덮는 종이색 판 — 그 아래 화면은 그대로 남아 있음 (`lock`은 이 판 위에 그려짐) |

### `connecting`

| Capture | State | 설명 |
|---|---|---|
| — | `connecting` | 서버 확인을 기다리는 화면. 처음 1.5초는 실 고리만 (글자 없음), 그다음 "Connecting…" |
| — | `connecting--slow` | 8초 후 — "Still connecting. Check your internet connection." |
| — | `connecting--failed` | 20초 후 — 실 없이 "Andy can't reach the server." |

| Name | 설명 |
|---|---|
| `connecting-thread` | 실 고리 (멈춤 → 지나감) |
| `connecting-retry-button` | Try again — 연결을 처음부터 다시 |
| `connecting-hint` | 앱을 완전히 껐다 켜라는 안내 |
| `connecting-sign-out-button` | Sign out — 로그인은 됐는데 서버가 끝내 받아주지 않을 때의 출구 (`connecting--failed`에만) |

### `home`

| Capture | State | 설명 |
|---|---|---|
| S4 | `home` | 로그인 후 첫 화면 — 브리핑 카드와 프로필 목록 |

| Name | 설명 |
|---|---|
| `briefing-card` | 금색 세로선이 있는 카드 — 다가오는 만남 (여기선 비어 있는 상태) |
| `briefing-card-title` | 카드 제목 — 지금은 "Nothing coming up" |
| `briefing-card-body` | 카드 설명 문장 |
| `briefing-card--ask` | 캘린더 연결 전 상태 — "Before you walk in" + 캘린더가 폰을 떠나지 않는다는 설명 |
| `briefing-card-connect-button` | Connect calendar — 누르면 iOS 권한 창 (누르는 중엔 "Asking…") |
| `briefing-card-not-now-button` | Not now — 바로 끔(창 없음). 연결은 Settings에서 |
| `briefing-card-permission-note` | "iPhone will ask for full access…" — iOS 창 전에 하는 설명 |
| `briefing-card-footnote` | "You can connect later in Settings." |
| `briefing-card--denied` | 권한 거절 상태 — 설명 + `briefing-card-open-settings-button` |
| `briefing-card-open-settings-button` | Open iPhone Settings — iPhone 설정의 Andy 페이지로 |
| `briefing-card--empty` | Nothing coming up |
| `briefing-card--ready` | 다가오는 미팅 — 시간(ink), 제목, 사람 |
| `briefing-card-when` | 미팅 시간 — 2026-10-11부터 brass가 아니라 ink (대비) |
| `briefing-card-reminder-button` | Remind me 10 minutes before › |
| `briefing-card-mute-button` | 오른쪽 위 ✕ (44pt) — 모든 상태에 있음. 누르면 `briefing-mute-alert` |
| `briefing-card--carousel` | 미팅이 2~10개일 때 — 다음 미팅이 첫 페이지, 나머지는 이전/다음으로. 저절로 넘어가지 않음 |
| `briefing-card-page` | 한 미팅 — 시간, 제목, 사람·고르기. VoiceOver는 제목에서 "Meeting 2 of 3, 11:05, Coffee with Emily" |
| `briefing-card-pager` | 카드 아래 한 번: `-previous-button` · `-page-position` · `-next-button` (미팅 1개면 없음) |
| `briefing-card-previous-button` | ‹ (44pt, `edge` 테두리) — 첫 페이지에선 비활성 |
| `briefing-card-next-button` | › (44pt, `edge` 테두리) — 마지막 페이지에선 비활성 |
| `briefing-card-page-position` | "1 of 3" — 점이 아니라 글자 |
| `briefing-card-person-link` | 미팅의 사람 한 줄 — 이름(moss) + 노트 수. 누르면 그 사람 프로필 |
| `briefing-card-pick` | 같은 이름이 여럿일 때 묻는 칸 — `-pick-label`, `-pick-note`, 후보들, `-pick-neither`. 미리 골라 둔 것 없음 |
| `briefing-card-pick-label` | "Which Priya is this?" |
| `briefing-card-pick-note` | "You've written about 2 people called Priya. Andy will remember your answer…" |
| `briefing-card-pick-choice` | 후보 한 줄 — 이름 + `briefing-card-pick-choice-meta`. 한 번 누르면 바로 저장 (창 없음) |
| `briefing-card-pick-choice-meta` | 후보 설명 "friend · 4 notes · last …" — `review`의 `name-choice`와 같은 문장 (`describePerson`) |
| `briefing-card-pick-neither` | Neither of them — Andy에 없는 Priya |
| `briefing-card-pick-change-button` | 고른 사람 아래 "Not this Priya?" — 다시 묻는 상태로 |
| `briefing-card-pick-none-line` | Neither를 고른 뒤 "Not a Priya you've written about." + Change |
| `briefing-mute-alert` | `confirm-dialog`: Mute the briefing? — `-today` Mute for today / `-indefinite` Mute until I turn it back on / `-cancel` Cancel (둘 다 moss) |
| `briefing-mute-alert-title` | Mute the briefing? |
| `briefing-mute-alert-body` | 연결된 경우 "The card leaves home and meeting reminders stay quiet…", 연결 전 "The card leaves home. You can connect…" |
| `profile-list` | 프로필 목록 전체 (알파벳순) |
| `profile-row` | 목록의 한 프로필 (탭하면 그 프로필 페이지) |
| `home-index` | 오른쪽 A–Z·# 세로 줄 (20명부터) — 누르거나 끌면 그 글자로. 아무도 없는 글자는 다음 글자로. VoiceOver엔 하나의 조절 컨트롤("Jump to a letter", 위·아래로 쓸어 넘김) |
| `home-letter-heading` | 목록의 글자 제목 (A, B, … #) — 20명부터. 스크롤하면 맨 위에 붙어 있음 |
| `profile-row-avatar` | 이름 왼쪽 원 (40pt) — 사진, 없으면 이니셜(예: EW). VoiceOver엔 숨김 (줄 이름이 이미 말함) |
| `profile-row-name` | 프로필 이름 |
| `profile-row-detail` | 그 프로필의 최근 기억할 내용 한 줄 (detail) |
| `profile-row-meta` | 노트 수 · 마지막 날짜 |
| `draft-line` | iOS가 앱을 닫았을 때 쓰던 노트, 노트마다 한 줄 (최대 3개, 최신 순) — "You were writing about Priya." (누군지 모르면 "You were writing a note.") + 초록 **Continue** / **Discard** (`draft-line-continue`, `draft-line-discard`; VoiceOver는 "Continue the note about Priya"). Discard는 먼저 물어봄. 없으면 안 보임 (device QA #52) |
| `outbox-line` | 오프라인에서 폰에 보관한 노트 수. 오프라인: "2 notes kept on this phone, waiting for Andy to read them." 온라인: "2 notes kept on this phone." + `outbox-line-action` (없으면 안 보임) |
| `outbox-line-action` | 온라인일 때 `outbox-line` 옆 초록 글자 — "Read the first now" / "Read it now". 가장 오래된 노트를 열어 바로 읽음 |
| `pending-line` | 오프라인에서 바꾼 것(노트 수정·삭제)이 아직 저장 안 됐을 때 — "1 change made offline, not saved yet." |
| `pending-line-sync` | 온라인일 때 `pending-line` 옆 초록 **Sync** — 누르면 모두 저장 (Syncing…) |
| `sync-conflict-alert` | Sync 중 그 노트가 다른 기기에서 바뀌었을 때 묻는 창 — Keep theirs / Keep mine (둘 다 moss, Cancel 없음). `confirm-dialog`로 그림 (QA #51) |
| `home-bottom-bar` | 홈 맨 아래 종이색 바 (위에 가는 선) — `home-search-field`가 들어 있고, `capture-orbit-trigger`(+)가 바 위쪽 선에 걸쳐 있음 (V-NOTCHED, home-actions.md) |
| `capture-orbit` | + (또는 사람 페이지의 Add a note)를 누르면 화면이 어두워지고 펼쳐지는 세 문 — `capture-orbit-item--voice`(12시) / `--write`(10시) / `--photo`(2시): 초록 원 + 아래 종이색 칩의 단어. 가운데는 ✕ (`capture-orbit-close`). 어두운 곳(`capture-orbit-scrim`)을 눌러도 닫힘. 오프라인이면 Photo 칩에 "Needs a connection", 누르면 `photo-offline-notice` (Write instead / Cancel). 가장 큰 글자 크기에선 세로 목록. 열릴 때 가벼운 진동 |
| `capture-orbit-item--voice` | orbit 12시 — 초록 원(마이크) + 칩 "Voice". 누르면 음성 화면이 바로 듣기 시작 |
| `capture-orbit-item--write` | orbit 10시 — 초록 원(연필) + 칩 "Write". 누르면 타이핑 화면 |
| `capture-orbit-item--photo` | orbit 2시 — 초록 원(카메라) + 칩 "Photo" (오프라인: 칩 아래 "Needs a connection") |
| `capture-orbit-close` | orbit 가운데 ✕ — + 자리에 그려짐. 닫기 (VoiceOver 마지막) |
| `capture-orbit-scrim` | orbit 뒤 어두운 화면 — 누르면 닫힘. VoiceOver엔 숨김 |
| `photo-offline-notice` | 오프라인에서 Photo를 누르면 — "Reading a photo needs a connection." / "Take it with your Camera now and choose it here later, or write it instead." + **Write instead** / Cancel (`confirm-dialog`) |
| `capture-orbit-trigger` | 72pt 둥근 초록 **+** (VoiceOver "New note") — `home-bottom-bar` 위쪽 선에 반쯤 걸침. 누르면 `capture-orbit`. 검색칸을 쓰는 동안엔 비킴. VoiceOver 순서: 목록 → 검색칸 → + (예전 `record-button`) |
| `home-search-field` | "Find a name or a word" — 홈 목록을 그 자리에서 거름 (무료·오프라인, Ask와 같은 이름 검색). 사람이 없으면 안 보임 |
| `home-search-clear` | 검색칸 안 오른쪽 ⓧ — 글자를 지움 (키보드는 그대로). 44pt 영역 |
| `home-search-cancel` | 검색칸 옆 초록 **Cancel** — 지우고 키보드 내림, Record가 돌아옴 |
| `home-ask-row` | 검색칸 위 초록 줄 — `Ask Andy: “…”` (비었으면 "Ask Andy in your own words"). 누르면 Ask에 그 글이 들어간 채 열림 (바로 묻지 않음). 오프라인: "Asking needs a connection. Names and words still work." (`home-ask-offline`) |
| `home-search-results` | 검색 중 목록 자리 — People / Came up in (`name-results`, Ask와 같은 줄). 없으면 `No one matches “…”.` |

### `record`

| Capture | State | 설명 |
|---|---|---|
| S5 | `record--ready` | 기록 — 시작 전 |
| S5b | `record--listening` | 기록 — 듣는 중 |
| S5c | `record--transcript` | 기록 — 들은 내용 확인 (Read it 전) |
| S5d | `record--scoped` | 기록 — 프로필에서 시작 (노트가 그 프로필로 감) |
| S5f | `record--paused` | 기록 — 멈춤 (Paused, ▶ Resume). 들은 말은 그대로 |
| S5h | `photo-camera` | Andy 카메라 (어두운 전체 화면) — Photo 문이 바로 엶. 새 빌드(5)부터; 그 전 빌드는 "Add a photo" 질문 |
| S5g | `photo-words` | 사진 글 확인 — 작은 사진 + "WHAT THE PHOTO SAYS ABOUT" + 이름 + 글 (고칠 수 있음) + Let Andy read it + Retake/Choose another |
| S5e | `write` | Write — orbit의 Write 문 (또는 Type it instead). 키보드가 바로 올라오고 본문만, 버튼은 Let Andy read it 하나 (예전 `record--typing`) |

| Name | 설명 |
|---|---|
| `record-prompt` | 무엇을 하면 되는지 한 줄 |
| `record-card` | 기록 화면 전체를 감싸는 큰 카드 (`edge` 테두리, `radius.card`) — 위에 받아쓴 글, 아래 시간, 맨 아래 버튼들 |
| `mic-button` | 시작 전에만 있는 가운데 초록 마이크 (VoiceOver "Record"). 누르면 듣기 시작. orbit의 Voice로 오면 보통 이 단계 없이 바로 듣기 |
| `record-timer` | 들은 시간 m:ss (Plex Mono). 듣는 동안 흐르고, 멈추면 멈춤 |
| `paused-label` | 멈췄을 때 시간 위의 작은 "Paused" |
| `pause-button` | 가운데 76pt 원 — 듣는 중엔 빨간(`alert`) ⏸ "Pause", 멈췄을 땐 ▶ "Resume" (글은 남고 이어서 받아씀) |
| `done-button` | 오른쪽 초록 채운 ✓ "Done" — 다 말함. 받아쓴 글을 고칠 수 있는 화면으로 |
| `photo-words-thumb` | `photo-words` 맨 위 작은 사진 — 누르면 `photo-viewer` (전체 크기, ✕로 닫음) |
| `photo-camera-close` | 카메라 왼쪽 위 ✕ — 사진 없이 닫으면 노트를 시작한 곳으로 |
| `photo-camera-hint` | 사진 위 "A card, a page of notes, or a screenshot." |
| `photo-camera-shutter` | 가운데 흰 셔터 (VoiceOver "Take photo") — 찍으면 바로 읽기 |
| `photo-camera-album` | 왼쪽 아래 앨범 (VoiceOver "Choose from library") — iOS 사진 선택기, 권한 안 물음 |
| `photo-camera-off` | 카메라 권한이 꺼졌을 때 — 안내 + 초록 **Choose a photo instead** |
| `photo-viewer` | 작은 사진을 누르면 뜨는 전체 크기 사진 (어두운 배경) — 이름을 원본과 비교 |
| `photo-viewer-close` | `photo-viewer` 왼쪽 위 ✕ (44pt) |
| `photo-words-about` | 사진에서 읽은 이름 칸 (비면 "who?"). 사람 페이지에서 왔으면 고정된 이름 |
| `photo-words-field` | 사진에 적힌 그대로의 글 — 고칠 수 있음 |
| `photo-words-read-button` | Let Andy read it — 고친 글과 이름으로 읽음 |
| `photo-words-retake` | Retake (앨범이면 Choose another) — 이 사진을 버리고 다시 |
| `photo-nothing` | 글이 없는 사진 — "Andy couldn't find any words in this photo. Try again closer, with more light." + 초록 Retake |
| `write-instead-button` | 음성을 쓸 수 없을 때(마이크 거부, 오프라인+모델 없음) 안내 아래 초록 **Write instead** → Write 화면 |
| ~~`scan-card-button`~~ | 없어짐 — orbit의 Photo 문으로 (2026-10-13) |
| ~~`type-instead-button`~~ | 없어짐 — orbit의 Write 문, 또는 `write-instead-button` (2026-10-13) |
| `write-about` | `write` — 사람 페이지에서 열었을 때 맨 위 조용한 "About Priya" |
| `write-body` | `write` 본문 — "Write or paste what you want to remember — one person's notes at a time." (사람 페이지: "Write what you want to remember about Priya."). 붙여넣기는 iOS 길게 누르기 |
| `write-count` | `write` — 12,000자 중 마지막 1,000자부터 "11,240 / 12,000". 넘으면 빨간색 + 안내문, Read 꺼짐 |
| `write-discard-alert` | `write`에서 글이 있을 때 뒤로 가면 — "Discard this note?" / "What you wrote will be cleared." (Discard / Cancel) |
| `transcript-live` | 실시간 받아쓰기 |
| `start-over-button` | 왼쪽 휴지통 "Start over" — 듣는 동안 항상 보임. 들은 말이 없으면 바로 처음으로, 있으면 "Start over?" (`start-over-alert`) |
| `start-over-alert` | 들은 말이 있을 때 Start over — "Start over?" / "What you said so far will be cleared." (Start over / **Keep recording**) |
| `transcript-lead` | "Is this what you said? Fix any name or word, then let Andy read it." |
| `note-source-label` | WHAT YOU SAID — 원문 섹션 제목 (노트 화면과 같은 이름) |
| `note-source-field` | 원문 — 여기선 고칠 수 있음 |
| `read-button` | Let Andy read it — Andy가 읽고 review로 (2026-10-11, 원래 "Read it") |
| `record-again-button` | 다시 녹음 |
| `offline-hint` | 오프라인일 때 Read it 자리 위의 안내 — 폰에 보관했다가 온라인이 되면 읽는다 |
| `keep-note-button` | 오프라인일 때 Read it 대신 — Keep this note (폰에 보관하고 돌아감) |
| `record-prompt--scoped` | "This note goes to <name>…" — 누구에게 갈지 미리 말함 |

### `review`

| Capture | State | 설명 |
|---|---|---|
| S6 | `review` | New note (원래 "Check this over") — 같은 이름 중 아직 안 고름 |
| S6b | `review` | New note (원래 "Check this over") — 아래쪽, 아직 저장 못 함 |
| S6c | `review` | New note (원래 "Check this over") — 한 명 고름 |
| S6d | `review` | New note (원래 "Check this over") — 아래쪽, 저장 가능 |

| Name | 설명 |
|---|---|
| `review-lead` | 이게 Andy가 기억할 내용이라는 안내 |
| `subject-name-field` | NAME — 이 노트의 subject 이름 |
| `name-choice-label` | WHICH MARCUS? — 같은 이름이 여럿일 때만 |
| `name-choice-hint` | 고른 사람에게 이 이름이 연결된다는 안내 |
| `name-choice` | 후보 프로필 카드 하나 (탭하면 선택) |
| `name-choice-meta` | 구분 줄 — 관계 · 노트 수 · 마지막 날짜 |
| `name-choice-view-link` | View — 그 프로필 보러 가기 |
| `name-choice-new` | Someone new — 새 프로필로 |
| `relationship-field` | HOW YOU KNOW THEM |
| `first-met-checkbox` | 처음 만난 날 체크 |
| `note-details-label` | WHAT TO REMEMBER |
| `note-detail-field` | 기억할 내용 한 줄 (detail) |
| `note-detail-remove-button` | × — 이 줄 지우기 |
| `note-details-add-button` | Add a fact (copy PR 후 Add a detail) |
| `tags-label` | TAGS — 비어 있어도 보임 |
| `tag-field` | 태그 한 칸 (× 로 지우기) |
| `tags-add-button` | Add a tag |
| `also-came-up-label` | ALSO CAME UP — 노트에 같이 나온 사람들, 비어 있어도 보임 |
| `mention-name-field` | 같이 나온 사람 이름 (× 로 지우기) |
| `mention-quote-field` | 노트에서 그 사람에 대한 부분 |
| `mention-add-button` | Add someone — 빠진 사람 추가 |
| `note-source-label` | WHAT YOU SAID |
| `note-source-field` | 원문 (고칠 수 있음) |
| `reread-button` | Read it again — 고친 원문으로 다시 읽기 |
| `note-source-edited-line` | "The details above still come from the old wording." — 원문을 고치면 그 아래 바로 뜸. 저장할 때 따로 묻지 않음 (QA #18/#19) |
| `remember-button--disabled` | Remember this — 아직 비활성 |
| `remember-blocked-reason` | 왜 저장 못 하는지 한 줄 |
| `discard-button` | Discard and start over |
| `name-choice--selected` | 고른 카드 (초록) |
| `name-choice-kept-note` | "To change how you know {name} or when you first met, edit their page." — 관계·첫 만남 칸 대신 나옴 |
| `remember-button` | Remember this — 저장 |

### `profile`

| Capture | State | 설명 |
|---|---|---|
| S7 | `profile--person` | 프로필 (사람) — 노트 타임라인 |
| S7b | `profile--person` | 프로필 (사람) — 태그와 Mentioned in이 있는 경우, review의 View에서 열림 |

| Name | 설명 |
|---|---|
| `profile-photo` | 프로필 사진 (탭하면 추가·변경) |
| `profile-name` | 큰 이름 제목 |
| `note-timeline` | 이 프로필의 노트들이 최신순으로 이어지는 세로선 목록 |
| `note-entry` | 타임라인의 노트 하나 |
| `note-entry-date` | 노트 날짜 |
| `note-entry-detail` | 노트에서 기억할 내용 (detail) 한 줄씩 |
| `note-entry-edit-button` | 이 노트 편집 — 노트 편집 화면으로 |
| `note-entry-came-up-label` | ALSO CAME UP — 이 노트에 같이 나온 사람들 제목 |
| `note-entry-came-up-link` | 같이 나온 프로필 (이름 탭하면 그 프로필로) — 인용문 |
| `note-entry-source-toggle` | ▸ What you wrote/said — 노트 원문 펼치기 |
| `follow-up-button` | 후속 메일 초안 만들기 |
| `add-note-button` | 이 프로필에 노트 추가 — 기록 화면으로 |
| `profile-photo--empty` | + — 사진 추가 |
| `profile-meta` | 관계 · first met |
| `tag-chip` | 태그 하나 |
| `mentioned-in-label` | MENTIONED IN — 다른 프로필의 노트에 나온 곳 |
| `mentioned-in-link` | 그 노트의 subject · 날짜 (탭하면 노트) |
| `mentioned-in-quote` | 그 노트에서의 인용 |

### `profile-edit`

| Capture | State | 설명 |
|---|---|---|
| S8 | `profile-edit` | 프로필 편집 |

| Name | 설명 |
|---|---|
| `name-field` | NAME |
| `name-field-hint` | 새 노트가 이 이름으로 연결된다는 안내 |
| `aliases-label` | ALSO KNOWN AS — 다른 이름들 |
| `aliases-add-button` | Add a name |
| `relationship-field` | HOW YOU KNOW THEM |
| `first-met-field` | FIRST MET 날짜 |
| `tags-label` | TAGS |
| `tags-add-button` | Add a tag |
| `profile-save-button` | Save changes |
| `profile-delete-button` | Delete + 이름 (확인 창) |
| `edit-offline-hint` | 오프라인일 때 — 바꾼 것은 Sync할 때까지 이 폰에 보관된다는 안내 |

### `note`

| Capture | State | 설명 |
|---|---|---|
| S9 | `note--edit` | 노트 하나 — 편집 상태 (프로필의 노트 Edit로 열림). 읽기 상태는 note--read |
| S9b | `note--read` | 노트 읽기 |

| Name | 설명 |
|---|---|
| `note-lead` | 노트 날짜 + 안내 한 줄 ("fix anything Andy got wrong") |
| `note-details-label` | WHAT TO REMEMBER — 기억할 내용 섹션 제목 |
| `note-details-empty` | 기억할 내용이 없을 때 문장 |
| `note-details-hint` | "Clearing a line removes that fact." 도움말 |
| `note-details-add-button` | Add a fact — 기억할 내용 한 줄 추가 (copy PR 후 Add a detail) |
| `note-source-label` | WHAT YOU WROTE / SAID / THE CARD SAID — 노트 원문 섹션 제목 |
| `note-source-text` | 노트 원문 (읽을 때 — 복사 가능) |
| `note-source-input` | Edit 중의 노트 원문 입력칸 — 오타를 고칠 수 있음 (device QA #48) |
| `note-source-hint` | "Fix a word that came out wrong…" — 원문을 고쳐도 기억할 내용은 그대로이고, 노트에 Edited가 표시된다는 안내 |
| `note-edited-mark` | 원문을 손으로 고친 노트의 `note-source-label` 옆 작은 **Edited** (읽을 때·Edit 중 모두) |
| `note-save-button` | Save changes — 저장 |
| `note-delete-button` | Delete this note — 노트 삭제 (확인 창이 뜸) |
| `note-date` | 노트 날짜 |
| `note-detail` | 기억할 내용 한 줄 |

### `ask`

| Capture | State | 설명 |
|---|---|---|
| S10 | `ask--empty` | Ask — 아직 아무것도 안 씀 |
| S10b | `ask--name-match` | Ask — 쓴 글자가 이름과 맞음, 프로필 목록 |
| S10b2 | `ask--name-match` | Ask — 이름이 여럿 + 다른 노트에 나온 곳 |
| S10c | `ask--answer` | Ask — 답과 근거 노트 |

| Name | 설명 |
|---|---|
| `ask-field` | 질문 칸 — placeholder "Who are you thinking of?" |
| `ask-submit-button--disabled` | Ask — 비어 있으면 비활성 |
| `ask-hint` | 무엇을 물을 수 있는지 안내 — 첫 문단: "Type a name, or ask in your own words — like “who just started a new job?”" |
| `ask-hint-detail` | 둘째 문단: 모든 노트를 본다는 것, 그리고 말한 것으로만 답한다는 것 |
| `ask-offline-hint` | 오프라인일 때 — 자연어 질문은 연결이 필요하고 이름 찾기는 된다는 안내 (Ask 버튼 비활성) |
| `ask-submit-button` | Ask |
| `profile-results-label` | PEOPLE — 이름이 맞는 프로필들 |
| `profile-result` | 프로필 하나 (탭하면 프로필) |
| `profile-result-meta` | 관계 · 노트 수 |
| `profile-result-meta--mention-only` | only mentioned — 자기 노트 없이 언급만 된 프로필 |
| `profile-result-match` | (testID에는 `-<profileId>`가 붙음) 이름이 아니라 단어로 찾았을 때 — 그 단어가 있는 문장 ("dog lover", "She fosters two greyhounds…"). 이름으로 찾았으면 안 보임 |
| `mention-results-label` | CAME UP IN — 이 이름이 나온 노트들 |
| `mention-result` | 그 노트의 subject (탭하면 노트) |
| `mention-result-quote` | 노트 속 인용 |
| `answer-text` | Andy의 답 |
| `answer-source-label` | FROM THE MARKED NOTES BELOW |
| `source-note` | 근거 노트 하나 |
| `source-note-subject` | 노트의 subject |
| `source-note-meta` | used in the answer · 관계 · 날짜 |
| `source-note-detail` | 그 노트의 기억할 내용 |
| `source-note-came-up-link` | ALSO CAME UP — 같이 나온 프로필 (탭하면 프로필) |
| `other-notes-toggle` | 답에 안 쓰인 노트 N개 펼치기 |

### `settings`

| Capture | State | 설명 |
|---|---|---|
| S11 | `settings` | 설정 |

| Name | 설명 |
|---|---|
| `settings-placeholder` | 임시 컴포넌트의 두 번째 제목 — 지울 예정 |
| `calendar-section` | CALENDAR 섹션 — 상태 문장 + 그 상태의 버튼들 (A안). 원격 스위치가 꺼졌거나 모듈이 없으면 안 보임 |
| `calendar-section-label` | CALENDAR |
| `calendar-status-line` | 상태 문장 — 연결 전 설명 / 거절 / "On — …" / "Off — …" |
| `calendar-connect-button` | Connect calendar (moss pill) — 이미 허용됐으면 iOS 창 없이 바로 켜짐 |
| `calendar-off-button` | Turn off in Andy (moss 글씨) — 확인 없이 바로 끔 |
| `calendar-muted-line` | Muted until tomorrow · `calendar-unmute-button` Turn back on |
| `calendar-remove-line` | "To take away access completely…" — 앱은 권한을 스스로 돌려줄 수 없어서 |
| `calendar-open-settings-button` | Open iPhone Settings (거절이면 pill, 아니면 조용한 글씨) |
| `reminders-row` | 알림 줄 — 켜짐/오늘만 끔일 때만. `reminders-status-line`, `reminders-on-button` (Remind me 10 minutes before), `reminders-open-settings-button` |
| `sign-out-button` | Sign out |
| `account-delete-button` | Delete account (확인 창) |
| `sign-out-alert` | 폰에 아직 안 읽힌 노트가 있을 때 Sign out 전에 묻는 창 — 로그아웃하면 지워진다. `confirm-dialog`로 그림, Sign out은 moss (QA #51) |

### `draft`

| Capture | State | 설명 |
|---|---|---|
| S12 | `draft` | 후속 메시지 초안 — 아래서 올라오는 시트 |

| Name | 설명 |
|---|---|
| `draft-sheet-title` | Follow-up to + 이름 |
| `draft-sheet-done` | Done — 닫기 |
| `draft-email-subject-field` | 이메일 제목 — 노트의 subject와 헷갈리지 않게 email을 붙임 |
| `draft-message-field` | 본문 |
| `copy-message-button` | 본문만 복사 |
| `copy-with-subject-button` | 제목 포함 복사 |
| `draft-regenerate-button` | Write another — 다시 쓰기 |
| `draft-footnote` | Andy는 보내지 않는다는 안내 |

### `ai-permission-sheet`

| Name | 설명 |
|---|---|
| `ai-permission-sheet` | AI로 보내기 전에 묻는 시트 — 첫 실행(잠금 해제 후 한 번)과, Not now 뒤에는 읽기·사진·Ask·초안을 누를 때마다. 아래로 밀면 Not now (pre-submission-privacy.md, A) |
| `ai-permission-allow` | Allow — moss pill. 서버에 저장 (`users.aiAllowedAt`) |
| `ai-permission-not-now` | Not now — moss 글자. 아무것도 보내지 않음 |
| `ai-permission-sheet-title` | Before Andy reads your notes |
| `ai-permission-sheet-body` | 누구에게(Anthropic, OpenAI), 왜, 학습 안 함, 캘린더 이름은 폰에 |
| `ai-permission-sheet-footnote` | Not now면 어떻게 되는지 + Settings에서 바꿀 수 있음 |
| `ai-status-line` | Settings 섹션의 상태 — "You've allowed this." / "Not allowed — …" |
| `ai-allow-button` | Settings의 Allow — moss pill |
| `ai-stop-button` | Stop sending — 조용한 ink 글자, 먼저 `ai-stop-alert`로 물음 |
| `ai-section` | Settings → What Andy sends — 허락 상태와 Allow / Stop sending (확인 창 `ai-stop-alert`: "Stop sending?" · Keep sending · Stop sending) |

### `note-delete-alert`

| Capture | State | 설명 |
|---|---|---|
| O1 | `note-delete-alert` | 노트 삭제 확인 — 캡처는 예전 iOS 시스템 알림. 이제 `confirm-dialog`로 그림 (QA #51) |

| Name | 설명 |
|---|---|
| `note-delete-alert` | 창 전체 (`confirm-dialog`) |
| `note-delete-alert-title` | Delete this note? |
| `note-delete-alert-body` | 무엇이 지워지는지 |
| `note-delete-alert-cancel` | Cancel (`confirm-dialog-cancel`) |
| `note-delete-alert-confirm` | Delete (`confirm-dialog-action`, alert 빨강) |
