# TESTERS.md — testing Andy V1 on your iPhone

Thank you for testing. Andy is a private notebook about the people you meet. You say or type what someone told you, Andy keeps it, and it brings it back when you need it: before you see them, or when you ask.

This is the **V1 QA build**. It is not in the App Store, and only people invited through TestFlight can install it.

---

## 1. Install

1. Accept the **App Store Connect** invitation email: "You've been invited to join…".
2. Install **TestFlight** from the App Store.
3. Open the **TestFlight invitation** email and tap **View in TestFlight**, then **Install** Andy.
4. Open Andy and **Sign in with Apple**. "Hide my email" is fine.

When a new build is ready, TestFlight shows **Update**. Always test the newest build, and say which build you used when you report. The build number is shown in TestFlight next to the version, for example `1.0.0 (3)`.

---

## 2. Before you start

- **Use made-up people**, or people who agreed to it. Notes leave your phone as text and are read by AI services (Anthropic for reading notes, OpenAI for search). Voice is transcribed on the phone; audio is never sent anywhere.
- **Speak English.** V1 supports English only. Korean transcribing badly is expected, not a bug.
- **Permissions are asked when a feature needs them**, not at launch: microphone and speech recognition, calendar, notifications, camera and photos, Face ID. Say **Allow** to test a feature. Also try **Don't Allow** once and check that the app explains how to turn it back on.
- **Your data is test data.** It is cleared before launch.
- **Not in V1, so please don't report these:**
  - the home-screen widget
  - the Siri shortcut
  - contacts sync
  - pets as their own kind of entry
  - tags as filters
  - dark mode (Andy stays light even when your phone is in dark mode)

  Ideas for them are welcome under "Idea".

---

## 3. What to test

### QA

Work through **[`QA.md`](https://github.com/nicoleekpark/andy/blob/main/QA.md)**, top to bottom. It has a table per area; each row says what to do and what should happen.

- **Skip rows that need developer tools.** That means rows mentioning `npm`, the simulator, the Convex dashboard, `__DEV__`, or editing server settings. Leave those for Nicole.
- **Skip rows marked ⏭ V1.1.**
- Calendar rows (§18–19) use **your own calendar**. Create test events like "Coffee with Marcus" for a person you've saved.
- **Do §22 (Delete your account) last.** It deletes everything you've entered.

If something works differently from the "Expect" column, **that's a report**, even if you're not sure it's wrong.

### Design

Check the app against **[`STYLE.md`](https://github.com/nicoleekpark/andy/blob/main/STYLE.md)**, the decided colours, type, spacing, motion and voice:

- [ ] **Colours:** only the six in STYLE.md. **Brass** appears inside the app only on the Briefing card; before sign-in, it's also the thread.
- [ ] **Type:** names, section headers and the home title in **Lora**; dates and metadata in **IBM Plex Mono**; everything else in the system font.
- [ ] **Spacing:** consistent gaps and edges, nothing touching the screen edge.
- [ ] **Thread motion:**
  - The name writes itself once on sign-in, in about 4 s.
  - The loop draws once on an empty home, in about 1.2 s.
  - It passes through while connecting.
  - It stays still with **Reduce Motion** on.
- [ ] **Icon and launch:** the icon in light, dark and tinted home-screen modes; the launch screen has no grey fade.
- [ ] **Copy:** sentence case everywhere, one name per action. Andy *remembers*, it never *collects*. Every sentence in the app is in one table, [`docs/copy-deck.md`](https://github.com/nicoleekpark/andy/blob/main/docs/copy-deck.md), with where it lives and what the new terminology will change it to. Read it top to bottom.
- [ ] **The same element looking different across screens:** section gaps, grey secondary text, field labels, the main button. Today they differ slightly between screens, and that is not on purpose (REFACTOR.md → E). When two screens differ, screenshot both and say which one is right.
- [ ] Anything that feels off, crowded, or unclear.

---

## 4. How to report

One report per problem, in **[where — to be decided by Nicole]**, in this shape:

```
Title:     <screen or part name> — <what is wrong, in a few words>
Build:     1.0.0 (3)
Steps:     1. …  2. …  3. …
Expected:  what should have happened (the QA.md row number, if there is one)
Actual:    what happened instead
Severity:  P0 / P1 / P2
Screenshot or screen recording: attached
```

Use the screen and part names from the labelled screen-names PDF (`docs/design/component-names.md`), e.g. `review — remember-button stays disabled`.

| Severity | Meaning |
|---|---|
| **P0** | Crash, data lost or shown wrong (someone else's note, a wrong person), can't continue |
| **P1** | Must be fixed before V1: confusing flow, wrong behaviour, design mismatch |
| **P2** | Polish, or an idea. Goes on the after-V1 list |

A screen recording beats a description: Control Centre → Screen Recording.
