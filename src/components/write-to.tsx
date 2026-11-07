import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SymbolView } from "expo-symbols";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { ConvexError } from "convex/values";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { MAX_ASKS_AFTER_FIRST, MAX_INSTRUCTION_CHARS, MAX_WRITE_TO_CHARS } from "../../convex/writeToPrompt";
import { MAX_IMAGE_CHARS } from "../../convex/extractionPrompt";
import { colors, disabledOpacity, fonts, radius, size, space, textOpacity, textSize } from "../constants/theme";
import { useAiGoAhead } from "@/lib/ai-go-ahead";
import { putOnClipboard } from "@/lib/clipboard";
import { useKeyboardHeight } from "@/lib/keyboard";
import { canSendTexts, openMessages } from "@/lib/messages";
import { shrinkForReading } from "@/lib/photo-size";
import { localToday } from "@/lib/dates";
import { useLocked } from "../lib/lock-context";
import { onForgetOnThisPhone } from "@/lib/on-phone";
import { ConfirmHost, useConfirm } from "@/components/confirm-dialog";
import { useOnline } from "@/lib/offline-copy";

/**
 * Write to {name} (`docs/design/decisions/draft-editing.md` → Final design, F).
 *
 * One sheet: box A, the arrow, then Andy's answer in box B, editable, with a
 * copy button; then edit it, or tell Andy what to change on the chat line, and
 * ask again (slices 4a, 4b), stepping through every version with ‹ › (4c).
 *
 * Swiping the sheet down only tucks it away (4d): opening Write to for the
 * same person again brings back both boxes, every version and the chat line.
 * Kept per person **in memory only** — never on disk, never on the server —
 * until Close (which asks first when nothing was copied), sign-out, or iOS
 * ending Andy. The live state sits in the profile screen, above the sheet, so
 * the app lock can hide the sheet without losing it.
 */

type Answer = FunctionReturnType<typeof api.writeTo.write>;

/**
 * One version: every Andy answer, and the person's edited text when they ask
 * again (Final design, behaviour 5). `answer` is Andy's answer — null for the
 * person's own text; `label` is the tone and format it carries, the person's
 * text taking the label of the version it was edited from.
 */
type Version = { text: string; answer: Answer | null; label: Answer };

/**
 * Their message, read from a screenshot (`write-to-quote`): while reading, a
 * thumbnail held in memory only; once read, just the words, which the person
 * can fix. The picture itself is never kept (behaviour 8).
 */
type Quote = { reading: true; thumb: string } | { reading: false; text: string };

/**
 * Delete a picture file Andy was handed. A failure leaves it in the picker's
 * cache folder, which sign-out clears with everything else (`forgetOnThisPhone`).
 */
async function removeFile(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // See above: the next sign-out takes it.
  }
}

/** What a tucked-away sheet keeps for its person. */
type Kept = {
  quote: string;
  request: string;
  versions: Version[];
  drafts: string[];
  shown: number;
  instruction: string;
  earlier: string[];
  asksAfterFirst: number;
  copiedOnce: boolean;
};

/**
 * Tucked-away sheets, by person — in memory only, gone with the app. A sign-out
 * the person chose clears them with everything else (`forgetOnThisPhone`).
 */
const kept = new Map<string, Kept>();
/** Every tucked-away sheet gone — on a sign-out the person chose. */
export function forgetWriteToSheets(): void {
  kept.clear();
}
onForgetOnThisPhone(forgetWriteToSheets);

/** Said in the Strings table's words; one line at a time. */
type Problem =
  | "failed"
  | "notNow"
  | "clipboard"
  | "messages"
  | "shotFailed"
  | "shotNone"
  | "shotTooLarge"
  | "shotNotNow";
const PROBLEMS: Record<Problem, string> = {
  failed: "Andy couldn't write that just now. Your text is still here. Try again.",
  notNow: "Nothing was sent. Tap the arrow when you want Andy to write it.",
  clipboard: "Andy couldn't reach the clipboard. Your text is still here — select it to copy it by hand.",
  messages: "Messages didn't open. Copy the text instead.",
  shotFailed: "That screenshot didn't come through. Try again.",
  shotNone: "Andy couldn't find a message in that screenshot. Try another, or type what they said.",
  shotTooLarge: "That screenshot is too large for Andy to read. Try another.",
  shotNotNow: "Nothing was sent, and the picture wasn't kept.",
};
/** VoiceOver's version of a line, where the Strings table gives one. */
const PROBLEMS_SPOKEN: Partial<Record<Problem, string>> = {
  notNow: "Nothing was sent. Tap Ask Andy when you want Andy to write it.",
};
const OFFLINE = "You're offline. Asking Andy needs a connection — your text stays here.";
const WRITING = "Andy is writing…";
const CAP = "That's the most Andy can do in one go. Copy it, or close and start again.";
const HINT = "Edit the text above, or tell Andy what to change.";

/** The sheet's state and what it can do, held by the screen that opens it. */
export function useWriteTo(profileId: string) {
  const write = useAction(api.writeTo.write);
  const rememberStyle = useMutation(api.writeTo.rememberStyle);
  const goAhead = useAiGoAhead();
  // Asked from out here: the question must outlive the sheet the lock hides.
  const confirm = useConfirm();
  const [start] = useState(() => kept.get(profileId));
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState(start?.request ?? "");
  const [quote, setQuote] = useState<Quote | null>(
    start !== undefined && start.quote !== "" ? { reading: false, text: start.quote } : null,
  );
  /** The words of the quote, once read: what goes to Andy with every ask. */
  const quoteText = quote !== null && !quote.reading ? quote.text : "";
  const [versions, setVersions] = useState<Version[]>(start?.versions ?? []);
  /**
   * Box B's text for each version, starting as the version itself. Kept per
   * version so stepping away from an edit and back again loses nothing.
   */
  const [drafts, setDrafts] = useState<string[]>(start?.drafts ?? []);
  const [shown, setShown] = useState(start?.shown ?? 0);
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  /** Cleared by editing, not by a timer: "Copied" stops being true when the text moves. */
  const [copied, setCopied] = useState(false);
  /** The chat line, and every line already sent in this sheet (Andy keeps them all). */
  const [instruction, setInstruction] = useState(start?.instruction ?? "");
  const [earlier, setEarlier] = useState<string[]>(start?.earlier ?? []);
  /** Asks after the first, counted here: the server keeps nothing to count with. */
  const [asksAfterFirst, setAsksAfterFirst] = useState(start?.asksAfterFirst ?? 0);
  /** Copied (or, from slice 5, opened in Messages) at least once: Close need not ask. */
  const [copiedOnce, setCopiedOnce] = useState(start?.copiedOnce ?? false);
  /** Whether this phone can send texts: Open Messages is hidden where it can't. */
  const [canText, setCanText] = useState(false);
  useEffect(() => {
    let live = true;
    void canSendTexts().then((can) => {
      if (live) setCanText(can);
    });
    return () => {
      live = false;
    };
  }, []);
  const inFlight = useRef(false);
  /**
   * Which opening of the sheet this is. Close moves it on, so an answer that
   * lands after Close is dropped rather than filling the next sheet with text
   * the person walked away from.
   */
  const session = useRef(0);
  /** The text box B holds right now, for a copy to check after its await. */
  const draftNow = useRef(start?.drafts[start.shown] ?? "");

  /**
   * The person this state was loaded for. If the screen is reused for someone
   * else, their own sheet is loaded in its place — React's way of resetting
   * state on a prop change, during render — so the save below only ever sees
   * the new person's own state, and nothing is filed under the wrong person.
   */
  const [owner, setOwner] = useState(profileId);
  if (owner !== profileId) {
    const theirs = kept.get(profileId);
    setOwner(profileId);
    setQuote(theirs !== undefined && theirs.quote !== "" ? { reading: false, text: theirs.quote } : null);
    setOpen(false);
    setWriting(false);
    setProblem(null);
    setCopied(false);
    setRequest(theirs?.request ?? "");
    setVersions(theirs?.versions ?? []);
    setDrafts(theirs?.drafts ?? []);
    setShown(theirs?.shown ?? 0);
    setInstruction(theirs?.instruction ?? "");
    setEarlier(theirs?.earlier ?? []);
    setAsksAfterFirst(theirs?.asksAfterFirst ?? 0);
    setCopiedOnce(theirs?.copiedOnce ?? false);
  }

  // The previous person's ask or copy, still running, must not land here.
  const loadedFor = useRef(profileId);
  useEffect(() => {
    if (loadedFor.current === profileId) return;
    loadedFor.current = profileId;
    session.current += 1;
    inFlight.current = false;
    const theirs = kept.get(profileId);
    draftNow.current = theirs?.drafts[theirs.shown] ?? "";
  }, [profileId]);

  // Kept for this person while there is anything to keep; Close deletes it.
  useEffect(() => {
    if (request === "" && quoteText === "" && versions.length === 0 && instruction === "") {
      kept.delete(profileId);
      return;
    }
    kept.set(profileId, {
      quote: quoteText,
      request,
      versions,
      drafts,
      shown,
      instruction,
      earlier,
      asksAfterFirst,
      copiedOnce,
    });
  }, [profileId, quoteText, request, versions, drafts, shown, instruction, earlier, asksAfterFirst, copiedOnce]);

  /** Close, for good: every version and the text are gone (behaviour 5). */
  const discard = useCallback(() => {
    session.current += 1;
    inFlight.current = false;
    draftNow.current = "";
    setWriting(false);
    setOpen(false);
    setRequest("");
    setQuote(null);
    setVersions([]);
    setDrafts([]);
    setShown(0);
    setProblem(null);
    setCopied(false);
    setInstruction("");
    setEarlier([]);
    setAsksAfterFirst(0);
    setCopiedOnce(false);
    kept.delete(profileId);
  }, [profileId]);

  /** A swipe down only tucks the sheet away; everything stays (behaviour 4). */
  const tuck = useCallback(() => setOpen(false), []);

  /** The Close button: asks first when there is text and none of it was copied. */
  const close = useCallback(() => {
    const anyText =
      request.trim() !== "" || quoteText.trim() !== "" || versions.length > 0 || instruction.trim() !== "";
    if (!anyText || copiedOnce) {
      discard();
      return;
    }
    confirm("Close without copying?", "Your text won't be kept.", [
      { text: "Keep writing", style: "cancel" },
      { text: "Close", onPress: discard },
    ]);
  }, [request, quoteText, versions.length, instruction, copiedOnce, confirm, discard]);

  const version = versions[shown] ?? null;
  const draft = drafts[shown] ?? "";
  /**
   * The version shown, as the sheet reads it: its text is what the arrow and
   * Edited compare box B with (behaviour 7); its label gives tone and format.
   */
  const answer = useMemo(() => {
    if (version === null) return null;
    return { ...version.label, text: version.text, droppedDetails: version.answer?.droppedDetails };
  }, [version]);

  const ask = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const mine = session.current;
    try {
      // The words typed and this person's notes go to Anthropic: asked first.
      if (!(await goAhead())) {
        if (mine === session.current) setProblem("notNow");
        return;
      }
      if (mine !== session.current) return;
      setProblem(null);
      setWriting(true);
      AccessibilityInfo.announceForAccessibility("Andy is writing");
      // A later ask: box B as it is, Andy's last answer (the server drops it
      // when unedited), every chat line so far, and the new one if any.
      const said = instruction.trim();
      const written = await write({
        profileId,
        today: localToday(),
        request,
        ...(quoteText.trim() === "" ? {} : { quote: quoteText }),
        earlierInstructions: earlier,
        ...(answer === null ? {} : { current: draft, lastAnswer: answer.text, instruction: said }),
      });
      if (mine !== session.current) return;
      // Box B's edit, when there is one, becomes a version of its own, and the
      // version it came from goes back to how it was; Andy's answer goes last.
      // An emptied box B is a fresh start, not a version worth stepping back to.
      const editedShown = answer !== null && draft.trim() !== "" && isEdited(draft, answer.text);
      const added: Version[] =
        editedShown && version !== null ? [{ text: draft, answer: null, label: version.label }] : [];
      added.push({ text: written.text, answer: written, label: written });
      const next = [...versions, ...added];
      setVersions(next);
      // Other versions keep their unsent edits; only the one asked from goes
      // back, since its edit is now a version of its own.
      setDrafts([
        ...drafts.map((text, i) => (editedShown && i === shown ? (versions[i]?.text ?? text) : text)),
        ...added.map((v) => v.text),
      ]);
      setShown(next.length - 1);
      draftNow.current = written.text;
      setCopied(false);
      if (answer !== null) {
        setAsksAfterFirst((n) => n + 1);
        if (said !== "") setEarlier((lines) => [...lines, said]);
        setInstruction("");
      }
      AccessibilityInfo.announceForAccessibility(
        `Andy's answer is ready. Version ${next.length} of ${next.length}.`,
      );
    } catch {
      // Every server failure shows the one line (Strings), and changes nothing:
      // both boxes and the chat line stay, and it does not count toward the 10.
      if (mine === session.current) setProblem("failed");
    } finally {
      // Close has already reset these for the sheet that comes next.
      if (mine === session.current) {
        inFlight.current = false;
        setWriting(false);
      }
    }
  }, [goAhead, write, profileId, request, quoteText, earlier, answer, draft, instruction, versions, drafts, shown, version]);

  const readScreenshot = useAction(api.writeTo.readScreenshot);
  /**
   * Reply with a screenshot (behaviour 8): one picture from Apple's picker —
   * no photo-library permission, the picker hands back only the one chosen —
   * read into `write-to-quote`. The picker's own copy of the file is deleted
   * as soon as its bytes are in memory, and the bytes go only to the read.
   */
  const addScreenshot = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const mine = session.current;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.6 });
      if (picked.canceled) return;
      const asset = picked.assets?.[0];
      let base64 = asset?.base64 ?? "";
      // A long chat screenshot can be past what one call may carry: made
      // smaller the way Andy's camera does it, rather than refused.
      if (asset !== undefined && base64.length > MAX_IMAGE_CHARS) {
        try {
          const small = await shrinkForReading(asset.uri, asset.width, asset.height);
          await removeFile(small.uri);
          base64 = small.base64;
        } catch {
          // Too large it stays; said below.
        }
      }
      // The picture is never kept, not even the picker's copy — removed before
      // anything else, whether or not this sheet is still the one open.
      if (asset !== undefined) await removeFile(asset.uri);
      if (mine !== session.current) return;
      if (base64 === "") {
        setProblem("shotFailed");
        return;
      }
      if (base64.length > MAX_IMAGE_CHARS) {
        setProblem("shotTooLarge");
        return;
      }
      // Their words go to Anthropic: asked first, like any ask.
      if (!(await goAhead())) {
        if (mine === session.current) setProblem("shotNotNow");
        return;
      }
      if (mine !== session.current) return;
      setProblem(null);
      setQuote({ reading: true, thumb: `data:image/jpeg;base64,${base64}` });
      const read = await readScreenshot({ imageBase64: base64, mediaType: "image/jpeg" });
      if (mine !== session.current) return;
      if (!read.found) {
        setQuote(null);
        setProblem("shotNone");
        return;
      }
      setQuote({ reading: false, text: read.text });
    } catch (thrown) {
      if (mine !== session.current) return;
      setQuote(null);
      const tooLarge = thrown instanceof ConvexError && String(thrown.data).includes("too large");
      setProblem(tooLarge ? "shotTooLarge" : "shotFailed");
    } finally {
      if (mine === session.current) inFlight.current = false;
    }
  }, [goAhead, readScreenshot]);

  const editQuote = useCallback((text: string) => {
    setQuote({ reading: false, text });
    setProblem(null);
  }, []);
  const removeQuote = useCallback(() => setQuote(null), []);

  /**
   * Any edit makes a failed ask, a Not now or a clipboard miss old news: the
   * line would otherwise sit over the reason the arrow is greyed now.
   */
  const setDraft = useCallback(
    (text: string) => {
      setDrafts((all) => all.map((was, i) => (i === shown ? text : was)));
      draftNow.current = text;
      setCopied(false);
      setProblem(null);
    },
    [shown],
  );
  /** ‹ › — to another version; announced as "Version 2 of 3". */
  const step = useCallback(
    (by: -1 | 1) => {
      const to = shown + by;
      if (to < 0 || to >= versions.length) return;
      setShown(to);
      draftNow.current = drafts[to] ?? "";
      setCopied(false);
      setProblem(null);
      AccessibilityInfo.announceForAccessibility(`Version ${to + 1} of ${versions.length}`);
    },
    [shown, versions.length, drafts],
  );
  const editRequest = useCallback((text: string) => {
    setRequest(text);
    setProblem(null);
  }, []);
  const editInstruction = useCallback((text: string) => {
    setInstruction(text);
    setProblem(null);
  }, []);

  /**
   * The text left the sheet — copied, or opened in Messages. Close need not ask
   * any more, and its tone and format become how Andy writes to this person
   * next time (Final design; slice 3). A failed save only means the next draft
   * starts from the older default, so it is not worth a line.
   */
  const finished = useCallback(() => {
    setCopiedOnce(true);
    if (answer !== null) {
      rememberStyle({ profileId, style: { tone: answer.tone, format: answer.format } }).catch(() => {});
    }
  }, [answer, rememberStyle, profileId]);

  const copy = useCallback(async () => {
    if (draft === "") return;
    const mine = session.current;
    const done = await putOnClipboard(draft);
    // Closed while it ran: the next sheet hears nothing about this copy.
    if (mine !== session.current) return;
    if (!done) {
      // Said rather than swallowed: a copy's result is invisible until the paste.
      setProblem("clipboard");
      setCopied(false);
      return;
    }
    // Edited while the copy ran: "Copied" would describe text that has moved.
    if (draftNow.current !== draft) return;
    setProblem((now) => (now === "clipboard" ? null : now));
    setCopied(true);
    AccessibilityInfo.announceForAccessibility("Copied");
    finished();
  }, [draft, finished]);

  /**
   * Open Messages: the composer with box B in it (behaviour 6). It counts as
   * copied once the text may have gone; a cancelled composer leaves nothing
   * sent, so Close still protects the text.
   */
  const openInMessages = useCallback(async () => {
    if (draft.trim() === "") return;
    const mine = session.current;
    const outcome = await openMessages(draft);
    if (mine !== session.current) return;
    if (outcome === "failed") {
      setProblem("messages");
      return;
    }
    setProblem((now) => (now === "messages" ? null : now));
    if (outcome === "sent") finished();
  }, [draft, finished]);

  return {
    open,
    show: useCallback(() => setOpen(true), []),
    close,
    tuck,
    request,
    setRequest: editRequest,
    quote,
    quoteText,
    addScreenshot,
    editQuote,
    removeQuote,
    answer,
    draft,
    setDraft,
    instruction,
    setInstruction: editInstruction,
    asksAfterFirst,
    /** Which version is shown (0-based) and how many there are. */
    shown,
    versionCount: versions.length,
    step,
    writing,
    problem,
    copied,
    ask,
    copy,
    canText,
    openInMessages,
  };
}

export type WriteToController = ReturnType<typeof useWriteTo>;

/** Why the arrow is greyed, said as its VoiceOver hint (Strings), or null when it is on. */
function arrowBlock(controller: WriteToController, online: boolean): string | null {
  const { writing, request, quote, quoteText, answer, draft, instruction, asksAfterFirst } = controller;
  if (writing || quote?.reading === true) return null;
  if (!online) return "Asking Andy needs a connection.";
  if (answer === null) {
    if (request.length > MAX_WRITE_TO_CHARS || quoteText.length > MAX_WRITE_TO_CHARS) {
      return "Shorten the text to ask Andy.";
    }
    // Box A is what to say, their message, or both.
    if (request.trim() === "" && quoteText.trim() === "") return "Write something first.";
    return null;
  }
  if (draft.length > MAX_WRITE_TO_CHARS || instruction.length > MAX_INSTRUCTION_CHARS) {
    return "Shorten the text to ask Andy.";
  }
  if (asksAfterFirst >= MAX_ASKS_AFTER_FIRST) return "That's the most Andy can do in one go.";
  // Something new: box B differs from the answer shown, or the chat line has text.
  // Compared trimmed, as the server compares them: a trailing space is not an
  // edit. An emptied box B is a fresh start once Andy is told what to write.
  if (instruction.trim() === "" && (draft.trim() === "" || !isEdited(draft, answer.text))) return HINT;
  return null;
}

/** Box B differs from Andy's answer, the way the server judges it (trimmed). */
const isEdited = (draft: string, answer: string) => draft.trim() !== answer.trim();

type Status = { text: string; spoken?: string; alert: boolean };

const tooLong = (over: number): Status => ({
  text: `That's too long for Andy to read at once. Shorten it by ${over} characters to ask.`,
  alert: true,
});

/** The one line under the boxes (`write-to-status-line`), or nothing. */
function statusOf(controller: WriteToController, online: boolean): Status | null {
  const { writing, problem, request, quoteText, answer, draft, instruction, asksAfterFirst } = controller;
  if (writing) return { text: WRITING, alert: false };
  const said: Status | null =
    problem === null ? null : { text: PROBLEMS[problem], spoken: PROBLEMS_SPOKEN[problem], alert: problem !== "notNow" };
  if (answer === null) {
    if (!online) return { text: OFFLINE, alert: false };
    if (request.length > MAX_WRITE_TO_CHARS) return tooLong(request.length - MAX_WRITE_TO_CHARS);
    if (quoteText.length > MAX_WRITE_TO_CHARS) return tooLong(quoteText.length - MAX_WRITE_TO_CHARS);
    return said;
  }
  if (said !== null) return said;
  if (draft.length > MAX_WRITE_TO_CHARS) return tooLong(draft.length - MAX_WRITE_TO_CHARS);
  if (instruction.length > MAX_INSTRUCTION_CHARS) {
    return { text: `Shorten this by ${instruction.length - MAX_INSTRUCTION_CHARS} characters.`, alert: true };
  }
  // Key details Andy still left out after its second try (slice ③): above the
  // cap and offline lines, because it is about the text about to be copied —
  // most of all at the cap, when copying is all that is left.
  const dropped = answer.droppedDetails ?? [];
  if (dropped.length > 0) return { text: `Check: ${dropped.join(", ")}`, alert: false };
  if (asksAfterFirst >= MAX_ASKS_AFTER_FIRST) return { text: CAP, alert: false };
  if (!online) return { text: OFFLINE, alert: false };
  return null;
}

/** The round arrow: the only thing that asks Andy (`write-to-arrow`). */
function Arrow({
  writing,
  busy,
  block,
  onPress,
}: {
  writing: boolean;
  /** What Andy is busy with instead, said by the spinner ("Reading Mina's message…"). */
  busy?: string;
  block: string | null;
  onPress: () => void;
}) {
  if (writing) return <ActivityIndicator color={colors.moss} accessibilityLabel="Andy is writing" />;
  if (busy !== undefined) return <ActivityIndicator color={colors.moss} accessibilityLabel={busy} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask Andy"
      accessibilityHint={block ?? undefined}
      disabled={block !== null}
      onPress={onPress}
      style={[styles.arrow, block !== null && styles.disabled]}
      testID="write-to-arrow"
    >
      <SymbolView
        name="arrow.up.circle.fill"
        size={size.touch}
        tintColor={colors.moss}
        fallback={<Text style={styles.arrowFallback}>Ask</Text>}
      />
    </Pressable>
  );
}

export function WriteToSheet({ personName, controller }: { personName: string; controller: WriteToController }) {
  const locked = useLocked();
  const online = useOnline();
  // One height on every screen, grown with Dynamic Type so the text area
  // stays usable when the rows inside the box grow too (WCAG 1.4.4) — up to
  // `writeBoxMaxScale`, past which the text scrolls inside the box.
  const { fontScale } = useWindowDimensions();
  const keyboard = useKeyboardHeight();
  const [viewport, setViewport] = useState(0);
  const grown = size.writeBox * Math.min(Math.max(1, fontScale), size.writeBoxMaxScale);
  // With the keyboard up, the box never fills all the room above it: a drag
  // that starts inside a box scrolls only the box, so a touch-high strip is
  // left below it to scroll the sheet on to the chat line and Open Messages.
  // `room` assumes the box can be scrolled to the top of the sheet, which it
  // can. Only very large text on a small phone ever needs it — about 219pt on
  // an iPhone SE at the largest size, still above the base; the strip wins
  // over the base height only where the room is smaller than that.
  const room = viewport - keyboard - space.xl - size.touch;
  const boxHeight = {
    height: keyboard > 0 && viewport > 0 ? Math.min(grown, Math.max(room, size.touch)) : grown,
  };
  const {
    request,
    setRequest,
    answer,
    draft,
    setDraft,
    instruction,
    setInstruction,
    shown,
    versionCount,
    step,
    writing,
    copied,
    ask,
    copy,
    close,
    tuck,
    canText,
    openInMessages,
    quote,
    addScreenshot,
    editQuote,
    removeQuote,
  } = controller;
  const reading = quote?.reading === true ? `Reading ${personName}'s message…` : undefined;
  const status = statusOf(controller, online);
  const block = arrowBlock(controller, online);
  // Edited: box B differs from Andy's answer shown — Andy hasn't seen this text.
  const edited = answer !== null && isEdited(draft, answer.text);
  // Said aloud when it changes: `accessibilityLiveRegion` is Android only, and
  // VoiceOver reads changed text only where its focus already is (WCAG 4.1.3).
  // "Andy is writing" is announced by `ask` itself.
  const spoken = status === null || status.text === WRITING ? null : (status.spoken ?? status.text);
  useEffect(() => {
    if (spoken !== null) AccessibilityInfo.announceForAccessibility(spoken);
  }, [spoken]);

  const statusLine =
    status !== null ? (
      <Text
        style={[styles.status, status.alert && styles.statusAlert]}
        accessibilityLabel={status.spoken}
        testID="write-to-status-line"
      >
        {status.text}
      </Text>
    ) : null;

  return (
    <Modal
      // Hidden, not unmounted, while the app lock is up: a native modal sits
      // above the lock's cover. The text lives in `useWriteTo`, above it.
      visible={!locked}
      animationType="slide"
      presentationStyle="pageSheet"
      // A swipe down tucks it away, kept for this person (behaviour 4).
      allowSwipeDismissal
      onRequestClose={tuck}
    >
      <View style={styles.fill} testID="write-to">
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={close}
            hitSlop={space.md}
            style={styles.close}
            testID="write-to-close-button"
          >
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Write to {personName}
          </Text>
          {/* Balances Close, so the title sits in the middle. */}
          <View style={styles.close} />
        </View>

        <ScrollView
          style={styles.fill}
          onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {answer === null ? (
            <>
              <View style={[styles.box, boxHeight]}>
                {quote === null ? null : quote.reading ? (
                  <View style={styles.quoteRow} testID="write-to-quote">
                    <Image source={{ uri: quote.thumb }} style={styles.thumb} accessibilityIgnoresInvertColors />
                    <Text style={styles.quoteLabel}>{`Reading ${personName}'s message…`}</Text>
                  </View>
                ) : (
                  <View style={styles.quote} testID="write-to-quote">
                    <View style={styles.quoteRow}>
                      <Text style={styles.quoteLabel} importantForAccessibility="no" accessibilityElementsHidden>
                        {personName} wrote
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${personName}'s message`}
                        disabled={writing}
                        onPress={removeQuote}
                        style={styles.quoteRemove}
                        testID="write-to-quote-remove"
                      >
                        <SymbolView
                          name="xmark"
                          size={size.icon}
                          tintColor={colors.ink}
                          fallback={<Text style={styles.quoteLabel}>✕</Text>}
                        />
                      </Pressable>
                    </View>
                    <TextInput
                      accessibilityLabel={`${personName} wrote: ${quote.text}`}
                      accessibilityHint="Double-tap to fix a word."
                      value={quote.text}
                      onChangeText={editQuote}
                      editable={!writing}
                      multiline
                      style={[styles.quoteText, writing && styles.dimmed]}
                      testID="write-to-quote-text"
                    />
                  </View>
                )}
                <TextInput
                  accessibilityLabel={`What to write to ${personName}`}
                  placeholder={
                    `Write what you want to say to ${personName}, or tell Andy what to write, or both. ` +
                    "Replying to a message from another app? Add a screenshot of it.\n\n" +
                    "e.g. Do you want to hang out and talk about our new product? Make it sound casual but still professional."
                  }
                  placeholderTextColor={colors.placeholder}
                  value={request}
                  onChangeText={setRequest}
                  editable={!writing}
                  multiline
                  style={[styles.boxText, writing && styles.dimmed]}
                  testID="write-to-ask-box"
                />
                <View style={styles.boxBottom}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add a screenshot"
                    accessibilityHint={
                      online
                        ? "Andy reads their message from it. The picture isn't kept."
                        : "Reading a screenshot needs a connection."
                    }
                    disabled={!online || writing || reading !== undefined}
                    onPress={() => void addScreenshot()}
                    style={[styles.arrow, (!online || writing || reading !== undefined) && styles.disabled]}
                    testID="write-to-screenshot-button"
                  >
                    <SymbolView
                      name="photo"
                      size={size.icon}
                      tintColor={colors.ink}
                      fallback={<Text style={styles.arrowFallback}>Photo</Text>}
                    />
                  </Pressable>
                  <Arrow writing={writing} busy={reading} block={block} onPress={() => void ask()} />
                </View>
              </View>
              {statusLine}
            </>
          ) : (
            <>
              <View style={[styles.box, boxHeight]}>
                <View style={styles.boxTop}>
                  {edited ? (
                    // Read as part of box B's label, not on its own (Strings).
                    <Text style={styles.edited} importantForAccessibility="no" accessibilityElementsHidden>
                      Edited
                    </Text>
                  ) : (
                    <View />
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Copy the message"
                    accessibilityHint={draft === "" ? "The box is empty." : undefined}
                    // Off while Andy writes: box B is about to be replaced.
                    disabled={draft === "" || writing}
                    onPress={() => void copy()}
                    style={[styles.copy, (draft === "" || writing) && styles.disabled]}
                    testID="write-to-copy-button"
                  >
                    {copied ? <Text style={styles.copied}>Copied</Text> : null}
                    <SymbolView
                      name={copied ? "checkmark" : "doc.on.doc"}
                      size={size.icon}
                      tintColor={colors.ink}
                      fallback={copied ? null : <Text style={styles.copied}>Copy</Text>}
                    />
                  </Pressable>
                </View>
                <TextInput
                  accessibilityLabel={edited ? `Message to ${personName}, edited` : `Message to ${personName}`}
                  value={draft}
                  onChangeText={setDraft}
                  editable={!writing}
                  multiline
                  style={[styles.boxText, writing && styles.dimmed]}
                  testID="write-to-draft-box"
                />
                {versionCount > 1 ? (
                  <View style={styles.stepper} testID="write-to-version-stepper">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Previous version"
                      disabled={writing || shown === 0}
                      onPress={() => step(-1)}
                      style={[styles.step, (writing || shown === 0) && styles.disabled]}
                    >
                      <Text style={styles.stepLabel}>‹</Text>
                    </Pressable>
                    <Text style={styles.stepCount} accessibilityLabel={`Version ${shown + 1} of ${versionCount}`}>
                      {shown + 1} of {versionCount}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Next version"
                      disabled={writing || shown === versionCount - 1}
                      onPress={() => step(1)}
                      style={[styles.step, (writing || shown === versionCount - 1) && styles.disabled]}
                    >
                      <Text style={styles.stepLabel}>›</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {/* The status line takes the hint's place while it shows. */}
              {statusLine ?? (
                <Text style={styles.status} testID="write-to-hint">
                  {HINT}
                </Text>
              )}
              <View style={styles.chatRow}>
                <TextInput
                  accessibilityLabel="Anything else for Andy? Optional"
                  placeholder="Anything else? (optional) e.g. Warmer but simpler."
                  placeholderTextColor={colors.placeholder}
                  value={instruction}
                  onChangeText={setInstruction}
                  editable={!writing}
                  style={[styles.chatLine, writing && styles.dimmed]}
                  testID="write-to-chat-line"
                />
                <Arrow writing={writing} block={block} onPress={() => void ask()} />
              </View>
              {canText ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open Messages"
                  accessibilityHint={
                    draft.trim() === ""
                      ? "The box is empty."
                      : "Opens Messages with this text. You choose who it goes to and send it."
                  }
                  disabled={draft.trim() === "" || writing}
                  onPress={() => void openInMessages()}
                  style={[styles.messages, (draft.trim() === "" || writing) && styles.disabled]}
                  testID="write-to-open-messages-button"
                >
                  <Text style={styles.messagesLabel}>Open Messages</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
        {/* The Close question, drawn inside the sheet so it sits above it. */}
        <ConfirmHost inModal />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  close: { minWidth: size.touch, minHeight: size.touch, justifyContent: "center" },
  closeLabel: { color: colors.moss, fontSize: textSize.lg },
  title: { color: colors.ink, fontSize: textSize.xl, fontFamily: fonts.display, flexShrink: 1, textAlign: "center" },
  content: { padding: space.xl, gap: space.sm, paddingBottom: space.xxxl },
  // Both boxes: one height on every screen; the field's edge is `edge` (3:1, WCAG 1.4.11).
  box: {
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: radius.control,
    padding: space.md,
  },
  boxText: {
    flex: 1,
    color: colors.ink,
    fontSize: textSize.lg,
    textAlignVertical: "top",
  },
  boxTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  edited: { color: colors.ink, fontSize: textSize.sm, opacity: textOpacity.secondary },
  // A rounded one-line field with the arrow inside, as in the mock; its only
  // edge is `edge` (3:1, WCAG 1.4.11).
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: radius.pill,
    paddingLeft: space.lg,
  },
  chatLine: { flex: 1, minHeight: size.touch, color: colors.ink, fontSize: textSize.lg },
  // The sheet's one filled button, as the old sheet's Copy was.
  messages: {
    minHeight: size.touch,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.control,
    backgroundColor: colors.moss,
    marginTop: space.sm,
  },
  messagesLabel: { color: colors.paper, fontSize: textSize.base },
  stepper: { flexDirection: "row", alignItems: "center" },
  step: { minWidth: size.touch, minHeight: size.touch, alignItems: "center", justifyContent: "center" },
  stepLabel: { color: colors.moss, fontSize: textSize.xxl },
  stepCount: { color: colors.ink, fontSize: textSize.sm, opacity: textOpacity.secondary },
  boxBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  // Their message, quiet above what the person writes: a rule, not a box.
  // Shares the box with what the person writes; long text scrolls inside.
  quote: {
    flexShrink: 1,
    borderLeftWidth: size.rule,
    borderLeftColor: colors.line,
    paddingLeft: space.sm,
    marginBottom: space.sm,
  },
  quoteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  quoteLabel: { color: colors.ink, fontSize: textSize.sm, opacity: textOpacity.secondary, flexShrink: 1 },
  quoteText: { flexShrink: 1, color: colors.ink, fontSize: textSize.md },
  quoteRemove: { minWidth: size.touch, minHeight: size.touch, alignItems: "center", justifyContent: "center" },
  thumb: { width: size.touch, height: size.touch, borderRadius: radius.control },
  arrow: { minWidth: size.touch, minHeight: size.touch, alignItems: "center", justifyContent: "center" },
  arrowFallback: { color: colors.moss, fontSize: textSize.lg },
  copy: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minWidth: size.touch,
    minHeight: size.touch,
    justifyContent: "flex-end",
  },
  copied: { color: colors.ink, fontSize: textSize.sm },
  dimmed: { opacity: textOpacity.quiet },
  disabled: { opacity: disabledOpacity },
  status: { color: colors.ink, fontSize: textSize.md, opacity: textOpacity.secondary },
  statusAlert: { color: colors.alert, opacity: 1 },
});
