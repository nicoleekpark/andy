import { useCallback, useEffect, useRef, useState } from "react";
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
} from "react-native";
import { SymbolView } from "expo-symbols";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { MAX_WRITE_TO_CHARS } from "../../convex/writeToPrompt";
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
 * copy button. This is the first part of it (slice 4a). Asking again, the chat
 * line, versions, the Close question and keeping the sheet when it is swiped
 * away follow in their own slices; until then Close and a swipe both close.
 *
 * Nothing is kept: the text lives in memory in the profile screen, above the
 * sheet, so the app lock can hide the sheet without losing it.
 */

type Answer = FunctionReturnType<typeof api.writeTo.write>;

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

/** The sheet's state and what it can do, held by the screen that opens it. */
export function useWriteTo(profileId: string) {
  const write = useAction(api.writeTo.write);
  const rememberStyle = useMutation(api.writeTo.rememberStyle);
  const goAhead = useAiGoAhead();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [draft, setDraftText] = useState("");
  const [writing, setWriting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  /** Cleared by editing, not by a timer: "Copied" stops being true when the text moves. */
  const [copied, setCopied] = useState(false);
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
    setAnswer(null);
    setDraftText("");
    setProblem(null);
    setCopied(false);
  }, []);

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
      const written = await write({ profileId, today: localToday(), request, earlierInstructions: [] });
      if (mine !== session.current) return;
      setAnswer(written);
      setDraftText(written.text);
      draftNow.current = written.text;
      setCopied(false);
      AccessibilityInfo.announceForAccessibility("Andy's answer is ready. Version 1 of 1.");
    } catch {
      // Every server failure shows the one line (Strings): box A stays as it was.
      if (mine === session.current) setProblem("failed");
    } finally {
      // Close has already reset these for the sheet that comes next.
      if (mine === session.current) {
        inFlight.current = false;
        setWriting(false);
      }
    }
  }, [goAhead, write, profileId, request]);

  const setDraft = useCallback((text: string) => {
    setDraftText(text);
    draftNow.current = text;
    setCopied(false);
    setProblem((now) => (now === "clipboard" ? null : now));
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
    setRequest,
    answer,
    draft,
    setDraft,
    writing,
    problem,
    copied,
    ask,
    copy,
  };
}

export type WriteToController = ReturnType<typeof useWriteTo>;

/** The one line under the box (`write-to-status-line`), or nothing. */
function statusOf(
  controller: WriteToController,
  online: boolean,
): { text: string; spoken?: string; alert: boolean } | null {
  const { writing, problem, request, answer } = controller;
  if (writing) return { text: WRITING, alert: false };
  // Only asking needs a connection, and until slice 4b asking ends at the
  // answer: after it, the line would cover "Check: …" for a reason that no
  // longer applies (copying works offline).
  if (!online && answer === null) return { text: OFFLINE, alert: false };
  if (answer === null && request.length > MAX_WRITE_TO_CHARS) {
    const over = request.length - MAX_WRITE_TO_CHARS;
    return { text: `That's too long for Andy to read at once. Shorten it by ${over} characters to ask.`, alert: true };
  }
  if (problem !== null) return { text: PROBLEMS[problem], spoken: PROBLEMS_SPOKEN[problem], alert: problem !== "notNow" };
  // Key details Andy still left out after its second try (slice ③).
  const dropped = answer?.droppedDetails ?? [];
  if (dropped.length > 0) return { text: `Check: ${dropped.join(", ")}`, alert: false };
  return null;
}

export function WriteToSheet({ personName, controller }: { personName: string; controller: WriteToController }) {
  const locked = useLocked();
  const online = useOnline();
  const { request, setRequest, answer, draft, setDraft, writing, copied, ask, copy, close } = controller;
  const status = statusOf(controller, online);
  // Said aloud when it changes: `accessibilityLiveRegion` is Android only, and
  // VoiceOver reads changed text only where its focus already is (WCAG 4.1.3).
  // "Andy is writing" is announced by `ask` itself.
  const spoken = status === null || status.text === WRITING ? null : (status.spoken ?? status.text);
  useEffect(() => {
    if (spoken !== null) AccessibilityInfo.announceForAccessibility(spoken);
  }, [spoken]);
  const canAsk = online && !writing && request.trim() !== "" && request.length <= MAX_WRITE_TO_CHARS;
  const arrowHint = !online
    ? "Asking Andy needs a connection."
    : request.length > MAX_WRITE_TO_CHARS
      ? "Shorten the text to ask Andy."
      : request.trim() === ""
        ? "Write something first."
        : undefined;

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
            <View style={styles.box}>
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
                {writing ? (
                  <ActivityIndicator color={colors.moss} accessibilityLabel="Andy is writing" />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ask Andy"
                    accessibilityHint={arrowHint}
                    disabled={!canAsk}
                    onPress={() => void ask()}
                    style={[styles.arrow, !canAsk && styles.disabled]}
                    testID="write-to-arrow"
                  >
                    <SymbolView
                      name="arrow.up.circle.fill"
                      size={size.touch}
                      tintColor={colors.moss}
                      fallback={<Text style={styles.arrowFallback}>Ask</Text>}
                    />
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.box}>
              <View style={styles.boxTop}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy the message"
                  accessibilityHint={draft === "" ? "The box is empty." : undefined}
                  disabled={draft === ""}
                  onPress={() => void copy()}
                  style={[styles.copy, draft === "" && styles.disabled]}
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
                accessibilityLabel={`Message to ${personName}`}
                value={draft}
                onChangeText={setDraft}
                multiline
                style={styles.boxText}
                testID="write-to-draft-box"
              />
            </View>
          )}

          {status !== null ? (
            <Text
              style={[styles.status, status.alert && styles.statusAlert]}
              accessibilityLabel={status.spoken}
              testID="write-to-status-line"
            >
              {status.text}
            </Text>
          ) : null}
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
    height: size.writeBox,
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
  boxTop: { flexDirection: "row", justifyContent: "flex-end" },
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
