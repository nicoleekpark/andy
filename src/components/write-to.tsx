import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
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
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { MAX_ASKS_AFTER_FIRST, MAX_INSTRUCTION_CHARS, MAX_WRITE_TO_CHARS } from "../../convex/writeToPrompt";
import { colors, disabledOpacity, fonts, radius, size, space, textOpacity, textSize } from "../constants/theme";
import { useAiGoAhead } from "@/lib/ai-go-ahead";
import { putOnClipboard } from "@/lib/clipboard";
import { localToday } from "@/lib/dates";
import { useLocked } from "../lib/lock-context";
import { useOnline } from "@/lib/offline-copy";

/**
 * Write to {name} (`docs/design/decisions/draft-editing.md` → Final design, F).
 *
 * One sheet: box A, the arrow, then Andy's answer in box B, editable, with a
 * copy button; then edit it, or tell Andy what to change on the chat line, and
 * ask again (slices 4a, 4b), stepping through every version with ‹ › (4c).
 * The Close question and keeping the sheet when it is swiped away follow in
 * their own slice; until then Close and a swipe both close.
 *
 * Nothing is kept: the text lives in memory in the profile screen, above the
 * sheet, so the app lock can hide the sheet without losing it.
 */

type Answer = FunctionReturnType<typeof api.writeTo.write>;

/**
 * One version: every Andy answer, and the person's edited text when they ask
 * again (Final design, behaviour 5). `answer` is Andy's answer — null for the
 * person's own text; `label` is the tone and format it carries, the person's
 * text taking the label of the version it was edited from.
 */
type Version = { text: string; answer: Answer | null; label: Answer };

/** Said in the Strings table's words; one line at a time. */
type Problem = "failed" | "notNow" | "clipboard";
const PROBLEMS: Record<Problem, string> = {
  failed: "Andy couldn't write that just now. Your text is still here. Try again.",
  notNow: "Nothing was sent. Tap the arrow when you want Andy to write it.",
  clipboard: "Andy couldn't reach the clipboard. Your text is still here — select it to copy it by hand.",
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
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  /**
   * Box B's text for each version, starting as the version itself. Kept per
   * version so stepping away from an edit and back again loses nothing.
   */
  const [drafts, setDrafts] = useState<string[]>([]);
  const [shown, setShown] = useState(0);
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  /** Cleared by editing, not by a timer: "Copied" stops being true when the text moves. */
  const [copied, setCopied] = useState(false);
  /** The chat line, and every line already sent in this sheet (Andy keeps them all). */
  const [instruction, setInstruction] = useState("");
  const [earlier, setEarlier] = useState<string[]>([]);
  /** Asks after the first, counted here: the server keeps nothing to count with. */
  const [asksAfterFirst, setAsksAfterFirst] = useState(0);
  const inFlight = useRef(false);
  /**
   * Which opening of the sheet this is. Close moves it on, so an answer that
   * lands after Close is dropped rather than filling the next sheet with text
   * the person walked away from.
   */
  const session = useRef(0);
  /** The text box B holds right now, for a copy to check after its await. */
  const draftNow = useRef("");

  const close = useCallback(() => {
    session.current += 1;
    inFlight.current = false;
    draftNow.current = "";
    setWriting(false);
    setOpen(false);
    setRequest("");
    setVersions([]);
    setDrafts([]);
    setShown(0);
    setProblem(null);
    setCopied(false);
    setInstruction("");
    setEarlier([]);
    setAsksAfterFirst(0);
  }, []);

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
        earlierInstructions: earlier,
        ...(answer === null ? {} : { current: draft, lastAnswer: answer.text, instruction: said }),
      });
      if (mine !== session.current) return;
      // Box B's edit, when there is one, becomes a version of its own, and the
      // version it came from goes back to how it was; Andy's answer goes last.
      const editedShown = answer !== null && isEdited(draft, answer.text);
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
  }, [goAhead, write, profileId, request, earlier, answer, draft, instruction, versions, drafts, shown, version]);

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
    if (answer !== null) {
      // The tone and format of the text copied become how Andy writes to this
      // person next time (Final design; slice 3). A miss only means the next
      // draft starts from the older default, so it is not worth a line.
      rememberStyle({ profileId, style: { tone: answer.tone, format: answer.format } }).catch(() => {});
    }
  }, [draft, answer, rememberStyle, profileId]);

  return {
    open,
    show: useCallback(() => setOpen(true), []),
    close,
    request,
    setRequest: editRequest,
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
  };
}

export type WriteToController = ReturnType<typeof useWriteTo>;

/** Why the arrow is greyed, said as its VoiceOver hint (Strings), or null when it is on. */
function arrowBlock(controller: WriteToController, online: boolean): string | null {
  const { writing, request, answer, draft, instruction, asksAfterFirst } = controller;
  if (writing) return null;
  if (!online) return "Asking Andy needs a connection.";
  if (answer === null) {
    if (request.length > MAX_WRITE_TO_CHARS) return "Shorten the text to ask Andy.";
    if (request.trim() === "") return "Write something first.";
    return null;
  }
  if (draft.length > MAX_WRITE_TO_CHARS || instruction.length > MAX_INSTRUCTION_CHARS) {
    return "Shorten the text to ask Andy.";
  }
  if (asksAfterFirst >= MAX_ASKS_AFTER_FIRST) return "That's the most Andy can do in one go.";
  // Something new: box B differs from the answer shown, or the chat line has text.
  // Compared trimmed, as the server compares them: a trailing space is not an edit.
  if (draft.trim() === "" || (!isEdited(draft, answer.text) && instruction.trim() === "")) return HINT;
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
  const { writing, problem, request, answer, draft, instruction, asksAfterFirst } = controller;
  if (writing) return { text: WRITING, alert: false };
  const said: Status | null =
    problem === null ? null : { text: PROBLEMS[problem], spoken: PROBLEMS_SPOKEN[problem], alert: problem !== "notNow" };
  if (answer === null) {
    if (!online) return { text: OFFLINE, alert: false };
    if (request.length > MAX_WRITE_TO_CHARS) return tooLong(request.length - MAX_WRITE_TO_CHARS);
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
function Arrow({ writing, block, onPress }: { writing: boolean; block: string | null; onPress: () => void }) {
  if (writing) return <ActivityIndicator color={colors.moss} accessibilityLabel="Andy is writing" />;
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
  // stays usable when the rows inside the box grow too (WCAG 1.4.4).
  const { fontScale } = useWindowDimensions();
  const boxHeight = { height: size.writeBox * Math.max(1, fontScale) };
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
  } = controller;
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
      onRequestClose={close}
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
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {answer === null ? (
            <>
              <View style={[styles.box, boxHeight]}>
                <TextInput
                  accessibilityLabel={`What to write to ${personName}`}
                  placeholder={
                    // The screenshot sentence joins with its button (slice 6).
                    `Write what you want to say to ${personName}, or tell Andy what to write, or both.\n\n` +
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
                <View style={styles.boxCorner}>
                  <Arrow writing={writing} block={block} onPress={() => void ask()} />
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
            </>
          )}
        </ScrollView>
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
  stepper: { flexDirection: "row", alignItems: "center" },
  step: { minWidth: size.touch, minHeight: size.touch, alignItems: "center", justifyContent: "center" },
  stepLabel: { color: colors.moss, fontSize: textSize.xxl },
  stepCount: { color: colors.ink, fontSize: textSize.sm, opacity: textOpacity.secondary },
  boxCorner: { flexDirection: "row", justifyContent: "flex-end" },
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
