import { useCallback, useState } from "react";
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { copiedStore, fingerprintOf } from "@/lib/on-phone";
import { ConfirmHost, useConfirm } from "@/components/confirm-dialog";
import { colors, disabledOpacity, fonts, radius, size, space, textOpacity, textSize } from "../constants/theme";
import { useLocked } from "../lib/lock-context";
import { hasNativeModule } from "../lib/native";

/**
 * The follow-up draft, in the app.
 *
 * It used to hand the draft straight to Mail through a `mailto:` URL and show
 * nothing, on the argument that Mail's compose window was a better review step
 * than anything built here. That argument was wrong in a way worth recording:
 * it assumed the message was going to be an email. A follow-up gets sent by
 * text, or KakaoTalk, or pasted into whatever the two people actually use, and
 * `mailto:` is a dead end for every one of those.
 *
 * So the draft stays here, editable, with a copy button — and nothing is sent
 * by this app at all, which was already true and is now visible.
 *
 * **Edits are not saved.** Closing discards them. This is a draft generated
 * from notes rather than a document: persisting it would create a second thing
 * to keep in step with the notes it came from, and the notes are the record.
 */

/**
 * Put text on the clipboard, or say it could not.
 *
 * Imported when it is used rather than at the top of the file, and that is the
 * whole point of this function. `expo-clipboard` is a native module, so its
 * JavaScript throws **on evaluation** when the binary it needs is not in the
 * app — and a static import made that throw during this module's own
 * evaluation, which the profile screen imports, which left the route with no
 * default export at all:
 *
 *     ERROR  [Error: Cannot find native module 'ExpoClipboard']
 *     WARN   Route "./(app)/profile/[id]/index.tsx" is missing the required
 *            default export.
 *
 * A dev client is rebuilt on EAS and takes minutes, so being one module behind
 * is an ordinary state here rather than a broken machine — and the cost of it
 * must be one button, not a person's whole profile. In a shipped build the
 * module is always present and this never fails.
 *
 * Asked before it is loaded, via `hasNativeModule`. Catching the throw kept
 * the app up, which was the point, and Expo still printed
 * `Cannot find native module 'ExpoClipboard'` with a full stack on every
 * press — a handled failure reported as though nothing had handled it.
 */
async function putOnClipboard(text: string): Promise<boolean> {
  if (!hasNativeModule("ExpoClipboard")) return false;
  try {
    // `require`, not `await import`. Metro resolves both lazily, but only this
    // one hands back the very object a `import * as Clipboard` elsewhere is
    // holding — the promise form returns an interop wrapper, which is enough
    // to make a test's spy sit on a different function than the one called.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const clipboard = require("expo-clipboard") as typeof import("expo-clipboard");
    await clipboard.setStringAsync(text);
    // Its fingerprint, not the text, so a sign-out can clear the clipboard
    // only while it still holds this (`forgetOnThisPhone`).
    try {
      copiedStore.write(JSON.stringify({ fingerprint: fingerprintOf(text) }));
    } catch {
      // The copy worked; only the clean-up on sign-out is lost.
    }
    return true;
  } catch {
    return false;
  }
}

/** One wording for the line and the announcement, so they cannot drift. */
function copiedMessage(what: "body" | "both"): string {
  return what === "body" ? "Message copied" : "Subject and message copied";
}

export type Draft = {
  personName: string;
  /** Empty for a message, which has none. */
  subject: string;
  body: string;
};

/** A follow-up's format and tone (`follow-up-tones.md`). */
export type DraftStyle = {
  format: "message" | "email";
  tone: "friendly" | "professional" | "brief";
};

/** Shared with Write to's compose step, so the two lists cannot drift. */
export const FORMATS: { value: DraftStyle["format"]; label: string }[] = [
  { value: "message", label: "Message" },
  { value: "email", label: "Email" },
];
export const TONES: { value: DraftStyle["tone"]; label: string }[] = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "brief", label: "Brief" },
];

type Props = {
  /**
   * The draft to show. Non-null, because the parent mounts this only when
   * there is one — which is what makes `useState(draft.subject)` correct.
   * Taking `null` here meant the sheet mounted empty alongside the profile and
   * needed its `key` to change before it would ever show anything, so the reset
   * that exists for rewrites was quietly load-bearing for the first draft too.
   */
  draft: Draft;
  onClose: () => void;
  /** Ask Claude for a different draft from the same notes. Costs a call. */
  onRewrite: () => void;
  /**
   * The format and tone of the text shown, or `null` with the
   * `followUpTones` switch off — then no picker, no chips, today's email.
   */
  style?: DraftStyle | null;
  /** Another format or tone: free if already written in this sheet, else a call. */
  onChooseStyle?: (style: DraftStyle) => void;
  /** Online: the picker and chips can write. Offline they wait (rule 9). */
  canWrite?: boolean;
  rewriting: boolean;
  /** A failed rewrite, shown without throwing away what is on screen. */
  error: string | null;
};

/** What the draft panel adds inside Write to's own sheet (follow-up-redesign.md). */
type PanelExtras = {
  /** Header title; "Follow-up to {name}" by default. */
  title?: string;
  /** "‹ Edit" back to what the draft was written from; absent, no back. */
  onBack?: () => void;
  /** `draft-intent-line`: what Andy did. Never copied. */
  intent?: string;
  /** `draft-sources-line`: what it was written from. Never copied. */
  sources?: string;
};

/**
 * The follow-up draft, in its own sheet — the path before Write to, kept
 * whole for the `writeTo` switch off.
 */
export function DraftSheet(props: Props) {
  const locked = useLocked();
  // Held out here, not in the panel: a hidden native modal unmounts what is
  // inside it, and the lock hides this one — edits have to survive that.
  const fields = useDraftFields(props.draft);
  return (
    <Modal
      // Hidden, not unmounted, while the app lock is up: a native modal sits
      // above the lock's cover, so leaving it visible would show the draft to
      // whoever is holding a locked phone. The text survives — this component
      // stays mounted — and the sheet comes back on unlock.
      visible={!locked}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      <DraftPanel {...props} fields={fields} />
    </Modal>
  );
}

/** The draft's editable fields and copy state, kept above any modal. */
export type DraftFields = ReturnType<typeof useDraftFields>;

/**
 * The fields a draft is edited in, for the component that owns the sheet.
 *
 * Starts from `draft`; a new draft object (a rewrite, even an identical one)
 * resets them, which is what keying the panel used to do — but the panel now
 * lives inside a modal that the app lock hides, and a hidden modal unmounts its
 * children, so the state has to live above it.
 */
export function useDraftFields(draft: Draft) {
  // Asked from out here too: a question belongs to whoever asked it, and the
  // panel is unmounted while the lock hides the sheet — the question must
  // outlive that and be handed to the app's own host.
  const confirm = useConfirm();
  const [shown, setShown] = useState(draft);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  /**
   * What was last copied, or `null`.
   *
   * Cleared by editing rather than by a timer. A timer would make this the one
   * thing on the screen a test has to wait for, and "Copied" going stale the
   * moment the text changes underneath it is the honest behaviour anyway.
   */
  const [copied, setCopied] = useState<"body" | "both" | null>(null);
  /** A copy that could not happen — see `putOnClipboard`. */
  const [failed, setFailed] = useState(false);
  if (shown !== draft) {
    // React's documented way to reset state when a prop changes: during render.
    setShown(draft);
    setSubject(draft.subject);
    setBody(draft.body);
    setCopied(null);
    setFailed(false);
  }
  return { subject, setSubject, body, setBody, copied, setCopied, failed, setFailed, confirm };
}

/**
 * The draft itself, without a sheet around it: `DraftSheet` wraps it in one,
 * and Write to shows it inside its own sheet after the compose step — one
 * sheet throughout, since presenting a second over a closing first is a race
 * iOS can lose.
 */
export function DraftPanel({
  draft,
  onClose,
  onRewrite,
  style = null,
  onChooseStyle = () => {},
  canWrite = true,
  rewriting,
  error,
  title,
  onBack,
  intent,
  sources,
  fields,
}: Props & PanelExtras & { fields: DraftFields }) {
  /** A message has no subject: nothing to show, edit or copy (rule 8). */
  const message = style?.format === "message";
  const { subject, setSubject, body, setBody, copied, setCopied, failed, setFailed, confirm } = fields;

  const edited = subject !== draft.subject || body !== draft.body;

  /**
   * What both fields do besides storing the text.
   *
   * One definition rather than the same two lines in each handler: "copied"
   * and "couldn't copy" are both statements about text that has since moved,
   * so they stop being true at the same moment, and a second copy of that
   * would agree only until one of them was changed.
   */
  const forgetTheLastCopy = useCallback(() => {
    setCopied(null);
    setFailed(false);
  }, [setCopied, setFailed]);

  const copy = useCallback(
    async (what: "body" | "both") => {
      const done = await putOnClipboard(
        what === "body" ? body : `${subject}\n\n${body}`,
      );
      if (!done) {
        // Said rather than swallowed. The result of this button is invisible,
        // so a copy that silently did nothing would be indistinguishable from
        // one that worked until the paste came out empty — or worse, came out
        // as whatever was on the clipboard before.
        setFailed(true);
        setCopied(null);
        return;
      }
      setFailed(false);
      setCopied(what);
      // Said out loud as well as shown. `accessibilityLiveRegion` is Android
      // only in React Native, and on iOS a `Text` that changes elsewhere on the
      // screen is announced only if VoiceOver already happens to be focused on
      // it — so without this, the one control whose whole result is invisible
      // confirms nothing to the person least able to check the clipboard.
      AccessibilityInfo.announceForAccessibility(copiedMessage(what));
    },
    [body, subject, setCopied, setFailed],
  );

  /**
   * Run `then`, asking first when there are edits to lose (rule 5): the
   * ordinary path stays one tap, and the question exists because there is no
   * wrong answer, only two a person has to pick between. "Keep my edits"
   * changes nothing, the chosen chip included.
   */
  const unlessEdited = useCallback(
    (then: () => void) => {
      if (!edited) {
        then();
        return;
      }
      confirm("Write another?", "Your edits to this draft will be replaced.", [
        { text: "Write another", onPress: then },
        { text: "Keep my edits", style: "cancel" },
      ]);
    },
    [confirm, edited],
  );
  const rewrite = useCallback(() => unlessEdited(onRewrite), [unlessEdited, onRewrite]);
  /** Tapping what is already chosen does nothing — no call (rule 4). */
  const choose = useCallback(
    (next: DraftStyle) => {
      if (style === null || (next.format === style.format && next.tone === style.tone)) return;
      unlessEdited(() => onChooseStyle(next));
    },
    [style, unlessEdited, onChooseStyle],
  );
  // While writing, or with no connection, nothing here can start a call (rules 7, 9).
  const choosing = style !== null && !rewriting && canWrite;
  /** "Write another" waits while writing, and offline once there is a style to write in. */
  const waiting = rewriting || (style !== null && !canWrite);

  return (
      <View style={styles.fill}>
        <View style={styles.header}>
          {onBack !== undefined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to what to write from"
              onPress={() => unlessEdited(onBack)}
              hitSlop={12}
              testID="draft-back"
            >
              <Text style={styles.done}>‹ Edit</Text>
            </Pressable>
          ) : null}
          <Text style={styles.title}>{title ?? `Follow-up to ${draft.personName}`}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the draft"
            onPress={onClose}
            hitSlop={12}
          >
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        {/*
          `automaticallyAdjustKeyboardInsets` rather than a `KeyboardAvoidingView`
          around the lot. A `pageSheet` modal is presented in its own view
          controller inset from the top of the window, and
          `KeyboardAvoidingView` measures against the root window instead — so
          its padding is computed for a frame this content is not in, which
          shows up as a gap under the keyboard or a cursor that never quite
          clears it, differently on different iOS versions. This prop hands the
          problem to `UIScrollView`'s own keyboard insets, which are measured in
          the sheet's coordinates.

          It also fixes the subtler half: React Native scrolls a focused input
          into view on *focus*, not on every keystroke, and the message field
          grows as it is typed into. Native insets keep the caret visible as it
          moves; the `KeyboardAvoidingView` version stopped helping after the
          first line.
        */}
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {style !== null ? (
            <View style={styles.styleRows}>
              <View
                style={styles.formatPicker}
                accessibilityRole="radiogroup"
                accessibilityLabel="Format"
                testID="draft-format-picker"
              >
                {FORMATS.map((format) => {
                  const selected = style.format === format.value;
                  return (
                    <Pressable
                      key={format.value}
                      accessibilityRole="radio"
                      accessibilityLabel={format.label}
                      accessibilityHint="Writes a new draft."
                      // `disabled` is derived by Pressable from the prop; only `selected` is said here.
                      accessibilityState={{ selected }}
                      disabled={!choosing}
                      onPress={() => choose({ format: format.value, tone: style.tone })}
                      style={[styles.formatOption, selected && styles.formatOptionOn, !choosing && styles.disabled]}
                      testID={`draft-format-option--${format.value}`}
                    >
                      <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>{format.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Tone">
                {TONES.map((tone) => {
                  const selected = style.tone === tone.value;
                  return (
                    <Pressable
                      key={tone.value}
                      accessibilityRole="radio"
                      accessibilityLabel={tone.label}
                      accessibilityHint="Writes a new draft."
                      // `disabled` is derived by Pressable from the prop; only `selected` is said here.
                      accessibilityState={{ selected }}
                      disabled={!choosing}
                      onPress={() => choose({ format: style.format, tone: tone.value })}
                      style={[styles.chip, selected && styles.chipOn, !choosing && styles.disabled]}
                      testID={`draft-tone-chip--${tone.value}`}
                    >
                      <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>{tone.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {error !== null ? <Text style={styles.error}>{error}</Text> : null}

          {message ? null : (
            <>
              <Text style={styles.label}>Subject</Text>
              <TextInput
                accessibilityLabel="Subject"
                value={subject}
                // Like the message: typing into a draft about to be replaced would be lost.
                editable={!rewriting}
                onChangeText={(next) => {
                  setSubject(next);
                  forgetTheLastCopy();
                }}
                style={styles.subject}
              />
            </>
          )}

          <Text style={styles.label}>Message</Text>
          <TextInput
            accessibilityLabel="Message"
            // While another draft is being written, said where it will land.
            placeholder={rewriting ? "Writing…" : undefined}
            placeholderTextColor={colors.placeholder}
            editable={!rewriting}
            value={body}
            onChangeText={(next) => {
              setBody(next);
              forgetTheLastCopy();
            }}
            multiline
            textAlignVertical="top"
            style={styles.body}
          />

          {/*
            What Andy did, and what from — said under the draft, never part of
            it: copying takes the fields above, not these.
          */}
          {intent !== undefined && intent !== "" ? (
            <Text testID="draft-intent-line" style={styles.intent}>
              {intent}
            </Text>
          ) : null}
          {sources !== undefined ? (
            <Text testID="draft-sources-line" style={styles.sources}>
              {sources}
            </Text>
          ) : null}

          {/*
            Not a toast and not a timer. The line stays until the text changes
            under it, which is the moment it stops being true.
          */}
          {failed ? (
            <Text testID="copy-failed" style={styles.error}>
              Andy couldn&apos;t reach the clipboard in this build. The draft is
              still here — select the text to copy it by hand.
            </Text>
          ) : null}

          {/* A slot one line tall whether or not it says anything. Shown
              only when it had something to say, the line pushed both copy
              buttons down under the finger that had just pressed one, so the
              next tap landed on the wrong thing. */}
          <View testID="copied-slot" style={styles.copiedSlot}>
            {copied !== null ? (
              <Text
                testID="copied"
                accessibilityLiveRegion="polite"
                style={styles.copied}
              >
                {copiedMessage(copied)}
              </Text>
            ) : null}
          </View>

          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy the message"
              onPress={() => copy("body")}
              style={styles.action}
            >
              <Text style={styles.actionLabel}>Copy message</Text>
            </Pressable>
            {message ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy the subject and message"
                onPress={() => copy("both")}
                style={styles.action}
              >
                <Text style={styles.actionLabel}>Copy with subject</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Write another draft"
            onPress={rewrite}
            disabled={waiting}
            style={[styles.rewrite, waiting && styles.disabled]}
          >
            <Text style={styles.rewriteLabel}>
              {rewriting ? "Writing…" : "Write another"}
            </Text>
          </Pressable>

          <Text style={styles.footnote}>
            Nothing is sent by Andy. Copy this into whatever you use.
          </Text>
        </ScrollView>
        {/*
          iOS draws this sheet above the whole app, so "Write another?" has to
          be drawn in here, or it would open behind the sheet.
        */}
        <ConfirmHost inModal />
      </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  title: { color: colors.ink, fontSize: 17, flexShrink: 1, paddingRight: 16 },
  done: { color: colors.moss, fontSize: 16 },
  content: { padding: 24, gap: 8, paddingBottom: 48 },
  /**
   * The same role as `sectionLabel` on the profile screen, and it has to be
   * the same face: every other uppercase label in the app is Lora, and this
   * one silently was not.
   */
  label: {
    color: colors.ink,
    fontSize: 12,
    opacity: textOpacity.quiet,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: fonts.display,
    marginTop: 8,
  },
  // The field's only visible edge: `edge`, 3:1 (WCAG 1.4.11), and a whole point wide.
  subject: {
    color: colors.ink,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.edge,
    paddingVertical: 8,
  },
  body: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 180,
    paddingVertical: 8,
  },
  copied: { color: colors.moss, fontSize: 13, lineHeight: 18 },
  copiedSlot: { minHeight: 18, justifyContent: "center" },
  error: { color: colors.alert, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", gap: 12, marginTop: 12 },
  action: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.moss,
  },
  actionLabel: { color: colors.paper, fontSize: 15 },
  rewrite: { alignItems: "center", paddingVertical: 14 },
  rewriteLabel: { color: colors.moss, fontSize: 15 },
  disabled: { opacity: disabledOpacity },
  styleRows: { gap: space.md, marginBottom: space.sm },
  // A segmented pair: its only edge is `edge` (3:1, WCAG 1.4.11).
  formatPicker: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  formatOption: {
    flex: 1,
    minHeight: size.touch,
    alignItems: "center",
    justifyContent: "center",
  },
  formatOptionOn: { backgroundColor: colors.moss },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: size.touch,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.edge,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  optionLabel: { color: colors.ink, fontSize: textSize.base },
  optionLabelOn: { color: colors.paper },
  // An aside about the draft, set off by a rule rather than a box.
  intent: {
    color: colors.ink,
    fontSize: textSize.md,
    lineHeight: 20,
    borderLeftWidth: 2,
    borderLeftColor: colors.line,
    paddingLeft: space.sm,
    marginTop: space.xs,
  },
  sources: { color: colors.ink, fontSize: textSize.sm, opacity: textOpacity.quiet, lineHeight: 18 },
  footnote: {
    color: colors.ink,
    fontSize: 13,
    opacity: textOpacity.quiet,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 4,
  },
});
