# Reference patterns: AI reply and compose surfaces

For `product-designer`, drawing the one flow in `follow-up-redesign.md`. Researched 2026-10-21 by `product-strategist` from public help pages and press. **Only what a source states is written as fact. *Inferred* marks my reading of it.** No product here was used hands-on, so check exact layouts against screenshots before copying any of them.

## What each product does

**Grammarly (GrammarlyGO) — replying to an email** [1][2]
- **Their message.** Grammarly reads the incoming email and shows a **"Sender's intent"** summary of what was said and its tone.
- **Intent.** Below that, **"Suggested ways to reply"**: three options with an emoji label each, for example "👍 Agree to attend and confirm what dish to bring". One tap picks one.
- **Tone.** Voice and a professional role are set in advance and can be changed email by email. In-app prompts include "Improve it", "Shorten it" and "Make it assertive" [2].
- **Result and after.** A complete reply. It can be inserted as is, rewritten for tone, length or detail, or edited by hand. The sources describe no version history.

**Gmail — Help me write, Refine, and suggested replies** [3][4][5]
- **Prompt.** Compose (including a reply), then **"Help me write"** at top right, then a free-text prompt, then **"Create"**.
- **Result.** An editable draft, with **"Recreate"** for another version. Gmail's help says that **after recreating, you can't go back to the previous version**.
- **Accept.** **"Insert"**, or **"Replace"** when refining.
- **Refine.** Polish, Formalize, Elaborate, Shorten [3][4].
- **Empty versus written.** On mobile, an empty draft shows the **Help me write** shortcut, and once there are about 12 words it becomes **Refine my draft** [4].
- **Feedback.** "Good suggestion" and "Bad suggestion" buttons [3].
- **Suggested replies.** Up to three Gemini replies appear at the bottom when replying, built from the whole thread. On Android, long-pressing a chip previews it, and tapping inserts it for editing [5].

**Apple Intelligence — Writing Tools** [6][7]
- **Where it opens.** Select text, then **Writing Tools**. A panel appears toward the bottom of the screen.
- **Tone.** **Rewrite**, plus three presets: **Friendly, Professional, Concise**.
- **Free text.** **"Describe your change"**, for example "Make this more enthusiastic" [6].
- **Result.** It replaces the text **in place**, with a glowing underline.
- **Versions.** **On-screen arrows** step between versions, and Rewrite makes another.
- **Controls.** **Revert** (back to the original) and **Done** [7].

**Superhuman — Instant Reply** [8][9]
- **When it appears.** When you hit reply, **three full draft replies** appear under the conversation. They're **precomputed**, so there's no wait [8].
- **How it's used.** Tab switches between them, Enter sends. A short label such as "Interested" expands into a full reply that uses the sender's name [9].
- **Voice.** Matches the voice of emails the user has already sent [8].
- I found no primary source for the layout of "Write with AI".

**Outlook — Copilot** [10]
- **Prompt.** On mobile: the Copilot icon, **Draft with Copilot**, a prompt, then generate.
- **Result.** **Keep it**, **Discard**, or **Regenerate**.
- **Tone and length.** Changed through **Options**, or from a dropdown after generating (on new Outlook and the web).
- **Other routes.** **"Help me reply"** opens a chat-style flow.

## Patterns Andy should adopt

1. **Put their message at the top.** Grammarly opens on what was sent, and Gmail's suggestions are built from the thread. In Reply, `reply-their-message` sits first, collapsed to two lines once it's there. Everything below it is about answering it. Andy's prompt also says the message leads.
2. **An empty screen offers one thing.** Gmail shows Help me write on an empty draft and Refine only once there's text. The empty Reply screen should therefore show only "Paste what they sent" and "Use a screenshot", plus the disclosure line. Tone, the say-field and Write it appear once there is a message. *Inferred: this is the fix for the "poor" empty screen.*
3. **Intents are short, plain choices directly under their message.** That's Grammarly's three "ways to reply" and Superhuman's "Interested". Andy's quick starts (Say yes · Decline warmly · …) sit right there, and tapping one fills the field, which can still be edited. Andy has no emoji in drafts, and these chips are fixed, so they cost no call.
4. **Three named tones, one tap each.** Apple's Friendly / Professional / Concise is the closest match, and people with iPhones already know it. Keep Andy's three as a single row of chips.
5. **Free text sits beside the presets.** Apple's "Describe your change" and Outlook's prompt box both do this. After a draft, `refine-field` sits in the same group as `refine-chip`s, not on another screen.
6. **Step through versions in place, and never lose one.** Apple's arrows and Outlook's previous/next do this. Gmail can't go back, and that's the case to avoid. Andy's "‹ 2 of 3 ›" lives on the draft itself.
7. **Keep one draft in view, replaced in place.** Apple rewrites in place and Gmail shows one editable draft. *Inferred:* a phone-height sheet works better as "their message → the draft → the controls" than as a growing chat log.
8. **The draft can be edited directly.** Gmail and Grammarly both allow this. Andy already does, and the edit carries into the next refine.
9. **One plainly named final action.** Gmail's Insert, Outlook's Keep it, Apple's Done. Andy's is **Copy message**, and it should be the most prominent control once a draft exists.
10. **Show what it was built from.** Grammarly's "Sender's intent" shows what it took from the message. Andy shows the reverse, `draft-sources-line`. Same idea: say what was read.

## Patterns to avoid

1. **Writing before the user asks.** Superhuman precomputes replies, and Gmail's suggestions appear by themselves. Andy charges per call and has promised to ask before anything is read (`ai-permission-sheet`, App Review 5.1.2(i)). Nothing is written until **Write it**.
2. **Anything that looks like sending.** Superhuman's Enter sends. Andy never sends (promise 2), so the action is **Copy**, never "Send", "Reply" or an arrow-send icon. "Reply" is the name of a door only.
3. **Learning the user's voice from mail they've sent.** Superhuman's style matching does this. It would need inbox access, which is ruled out in Reality Checks 4–5. Andy's register comes from the tone and the user's own words.
4. **Dropping old versions, or rating chips.** Gmail's Recreate drops the old version, and its Good/Bad buttons send feedback. Andy keeps every version, and has no tracking (promise 4), so there are no rating buttons.
5. **AI sparkle and glow.** Apple's glowing underline, and the "AI" iconography these products use. STYLE.md allows SF Symbols only, the brass signature is reserved, and "Andy remembers" is the voice. *Inferred:* sparkle marks would read as a generic AI tool rather than a notebook.

## Sources

[1] Grammarly blog, *How to Send Polished Email Replies With Grammarly* — https://www.grammarly.com/blog/product/grammarlygo-email-replies/
[2] TechRepublic, *GrammarlyGO uses AI to write your emails* — https://www.techrepublic.com/article/grammarlygo-ai-writing-emails/
[3] Gmail Help, *Draft emails with Gemini in Gmail* (iPhone) — https://support.google.com/mail/answer/13955415?co=GENIE.Platform%3DiOS
[4] Android Authority, *Gmail can now help you polish your drafts with a tap* — https://www.androidauthority.com/gmail-help-me-write-polish-3473643/
[5] Android Police, *Google supercharges Gmail's Smart Reply suggestions with Gemini* — https://www.androidpolice.com/google-supercharges-gmail-smart-reply-suggestions-gemini/ ; Gmail Help, *Use Smart Reply* — https://support.google.com/mail/answer/17493601?co=GENIE.Platform%3DiOS
[6] Asurion, *How to use Apple Intelligence Writing Tools* — https://www.asurion.com/connect/tech-tips/how-to-use-apple-intelligence-writing-tools/
[7] How-To Geek, *How to Use Apple Intelligence Writing Tools* — https://www.howtogeek.com/how-to-use-apple-intelligence-writing-tools-on-iphone-ipad-and-mac/
[8] BGR, *Superhuman's new Instant Reply feature* — https://www.bgr.com/tech/superhumans-new-instant-reply-feature-uses-generative-ai-to-reply-to-emails-for-you/
[9] TechCrunch, *Superhuman launches AI-powered instant replies* (2024-02-27) — https://techcrunch.com/2024/02/27/superhuman-launches-an-ai-powered-instant-replies-feature/
[10] Microsoft Support, *Draft an email message with Copilot in Outlook* — https://support.microsoft.com/en-us/outlook/copilot-pages/draft-an-email-message-with-copilot-in-outlook

Not covered, as I found no primary source within this pass: Notion AI and LinkedIn message assist.
