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
| `nav-bar-back` | iOS 뒤로가기 (< 이전 화면 제목) |
| `nav-bar-title` | 맨 위 가운데 제목 |
| `nav-bar-action-right` | 맨 위 오른쪽 자리 — 화면마다 다름 (Settings, Edit) |
| `expo-dev-menu` | 왼쪽 위 톱니 — 개발용 빌드에만 있음, 테스터 앱엔 없음 |
| `debug-panel` | record 화면 아래 개발용 진단 줄 — 테스터 빌드에서 숨길지 결정 필요 |
| `offline-copy-line` | 오프라인에서 폰의 사본을 보여줄 때 화면 맨 위 — "Offline — showing what Andy had at 3:40 PM." (home·프로필·노트·Ask 공통, 온라인이면 안 보임) |
| `note-source-label` / `-text` / `-field` / `-hint` | 노트 원문 (WHAT YOU SAID / WROTE) — 기록·리뷰·노트 화면 공통 |
| `note-details-label` / `note-detail` / `note-detail-field` / `note-details-add-button` | 기억할 내용 (WHAT TO REMEMBER) — 리뷰·노트 화면 공통 |

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
| `profile-list` | 프로필 목록 전체 (알파벳순) |
| `profile-row` | 목록의 한 프로필 (탭하면 그 프로필 페이지) |
| `profile-row-name` | 프로필 이름 |
| `profile-row-detail` | 그 프로필의 최근 기억할 내용 한 줄 (detail) |
| `profile-row-meta` | 노트 수 · 마지막 날짜 |
| `outbox-line` | 오프라인에서 폰에 보관한 노트 수. 오프라인: "2 notes kept on this phone, waiting for Andy to read them." 온라인: "2 notes kept on this phone." + `outbox-line-action` (없으면 안 보임) |
| `outbox-line-action` | 온라인일 때 `outbox-line` 옆 초록 글자 — "Read the first now" / "Read it now". 가장 오래된 노트를 열어 바로 읽음 |
| `pending-line` | 오프라인에서 바꾼 것(노트 수정·삭제)이 아직 저장 안 됐을 때 — "1 change made offline, not saved yet." |
| `pending-line-sync` | 온라인일 때 `pending-line` 옆 초록 **Sync** — 누르면 모두 저장 (Syncing…) |
| `sync-conflict-alert` | Sync 중 그 노트가 다른 기기에서 바뀌었을 때 묻는 iOS 알림 — Keep theirs / Keep mine |
| `ask-button` | Ask Andy 화면을 여는 버튼 |
| `record-button` | 새 노트를 기록하는 초록 버튼 |

### `record`

| Capture | State | 설명 |
|---|---|---|
| S5 | `record--ready` | 기록 — 시작 전 |
| S5b | `record--listening` | 기록 — 듣는 중 |
| S5c | `record--transcript` | 기록 — 들은 내용 확인 (Read it 전) |
| S5d | `record--scoped` | 기록 — 프로필에서 시작 (노트가 그 프로필로 감) |

| Name | 설명 |
|---|---|
| `record-prompt` | 무엇을 하면 되는지 한 줄 |
| `mic-button` | Record — 누르면 듣기 시작 (상태 mic-button--listening = Stop) |
| `scan-card-button` | 명함 스캔 |
| `type-instead-button` | 말 대신 타이핑 |
| `transcript-live` | 실시간 받아쓰기 |
| `mic-button--listening` | Stop — 듣기 끝 |
| `start-over-button` | 처음부터 다시 |
| `transcript-lead` | 이름·단어를 먼저 고치라는 안내 |
| `note-source-label` | WHAT YOU SAID — 원문 섹션 제목 (노트 화면과 같은 이름) |
| `note-source-field` | 원문 — 여기선 고칠 수 있음 |
| `read-button` | Read it — Andy가 읽고 review로 |
| `record-again-button` | 다시 녹음 |
| `offline-hint` | 오프라인일 때 Read it 자리 위의 안내 — 폰에 보관했다가 온라인이 되면 읽는다 |
| `keep-note-button` | 오프라인일 때 Read it 대신 — Keep this note (폰에 보관하고 돌아감) |
| `record-prompt--scoped` | "This note goes to <name>…" — 누구에게 갈지 미리 말함 |

### `review`

| Capture | State | 설명 |
|---|---|---|
| S6 | `review` | Check this over — 같은 이름 중 아직 안 고름 |
| S6b | `review` | Check this over — 아래쪽, 아직 저장 못 함 |
| S6c | `review` | Check this over — 한 명 고름 |
| S6d | `review` | Check this over — 아래쪽, 저장 가능 |

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
| `note-source-hint` | 원문을 고쳐도 위 내용은 그대로라는 안내 |
| `note-source-field` | 원문 (고칠 수 있음) |
| `reread-button` | Read it again — 고친 원문으로 다시 읽기 |
| `remember-button--disabled` | Remember this — 아직 비활성 |
| `remember-blocked-reason` | 왜 저장 못 하는지 한 줄 |
| `discard-button` | Discard and start over |
| `name-choice--selected` | 고른 카드 (초록) |
| `name-choice-kept-note` | 기존 프로필 정보는 안 바뀐다는 안내 — 관계·첫 만남 칸 대신 나옴 |
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
| `note-lead` | 노트 날짜 + 안내 한 줄 ("fix any fact Andy got wrong") |
| `note-details-label` | WHAT TO REMEMBER — 기억할 내용 섹션 제목 |
| `note-details-empty` | 기억할 내용이 없을 때 문장 |
| `note-details-hint` | "Clearing a line removes that fact." 도움말 |
| `note-details-add-button` | Add a fact — 기억할 내용 한 줄 추가 (copy PR 후 Add a detail) |
| `note-source-label` | WHAT YOU WROTE / SAID / THE CARD SAID — 노트 원문 섹션 제목 |
| `note-source-text` | 노트 원문 (읽기 전용, 복사 가능) |
| `note-source-hint` | "Kept as it was saved…" 원문은 못 고친다는 안내 |
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
| `ask-hint` | 무엇을 물을 수 있는지 안내 |
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
| `sign-out-button` | Sign out |
| `account-delete-button` | Delete account (확인 창) |
| `sign-out-alert` | 폰에 아직 안 읽힌 노트가 있을 때 Sign out 전에 묻는 iOS 알림 — 로그아웃하면 지워진다 |

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

### `note-delete-alert`

| Capture | State | 설명 |
|---|---|---|
| O1 | `note-delete-alert` | 노트 삭제 확인 — iOS 시스템 알림, 문구는 Andy |

| Name | 설명 |
|---|---|
| `note-delete-alert` | 알림 전체 |
| `note-delete-alert-title` | Delete this note? |
| `note-delete-alert-body` | 무엇이 지워지는지 |
| `note-delete-alert-cancel` | Cancel |
| `note-delete-alert-confirm` | Delete (빨강) |
