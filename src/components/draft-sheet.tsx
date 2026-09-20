import { useCallback, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import { colors, fonts } from "../constants/theme";

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
 * Loaded once and remembered, including the failure. Catching the throw kept
 * the app up but still printed a red `Cannot find native module` with a full
 * stack on *every* press — a handled error, reported as though it were not,
 * repeatedly. `requireOptionalNativeModule` would answer the question without
 * throwing, but it returns `null` under jest whatever the binary holds, and
 * mocking it means replacing the module jest-expo already mocks. Remembering
 * the answer costs one line and makes the noise happen at most once.
 */
let clipboardModule: typeof import("expo-clipboard") | null | undefined;

function loadClipboard(): typeof import("expo-clipboard") | null {
  if (clipboardModule !== undefined) return clipboardModule;

  let loaded: typeof import("expo-clipboard") | null;
  try {
    // `require`, not `await import`. Metro resolves both lazily, but only this
    // one hands back the very object a `import * as Clipboard` elsewhere is
    // holding — the promise form returns an interop wrapper, which is enough
    // to make a test's spy sit on a different function than the one called.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require("expo-clipboard");
  } catch {
    loaded = null;
  }
  clipboardModule = loaded;
  return loaded;
}

async function putOnClipboard(text: string): Promise<boolean> {
  const clipboard = loadClipboard();
  if (clipboard === null) return false;
  try {
    await clipboard.setStringAsync(text);
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
  subject: string;
  body: string;
};

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
  rewriting: boolean;
  /** A failed rewrite, shown without throwing away what is on screen. */
  error: string | null;
};

export function DraftSheet({
  draft,
  onClose,
  onRewrite,
  rewriting,
  error,
}: Props) {
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
  }, []);

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
    [body, subject],
  );

  const rewrite = useCallback(() => {
    if (!edited) {
      onRewrite();
      return;
    }
    // Asked only when there is something to lose, the same rule the capture
    // screen follows when the transcript and the facts disagree: the ordinary
    // path stays one tap, and the question exists because there is no wrong
    // answer, only two a person has to pick between.
    Alert.alert(
      "Replace what you wrote?",
      "Andy will write a new draft from the same notes. Your edits go with the old one.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Write another",
          style: "destructive",
          onPress: onRewrite,
        },
      ],
    );
  }, [edited, onRewrite]);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.fill}>
        <View style={styles.header}>
          <Text style={styles.title}>Follow-up to {draft.personName}</Text>
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
          {error !== null ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.label}>Subject</Text>
          <TextInput
            accessibilityLabel="Subject"
            value={subject}
            onChangeText={(next) => {
              setSubject(next);
              forgetTheLastCopy();
            }}
            style={styles.subject}
          />

          <Text style={styles.label}>Message</Text>
          <TextInput
            accessibilityLabel="Message"
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
            Not a toast and not a timer. The line stays until the text changes
            under it, which is the moment it stops being true.
          */}
          {failed ? (
            <Text testID="copy-failed" style={styles.error}>
              Andy couldn&apos;t reach the clipboard in this build. The draft is
              still here — select the text to copy it by hand.
            </Text>
          ) : null}

          {copied !== null ? (
            <Text
              testID="copied"
              accessibilityLiveRegion="polite"
              style={styles.copied}
            >
              {copiedMessage(copied)}
            </Text>
          ) : null}

          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy the message"
              onPress={() => copy("body")}
              style={styles.action}
            >
              <Text style={styles.actionLabel}>Copy message</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy the subject and message"
              onPress={() => copy("both")}
              style={styles.action}
            >
              <Text style={styles.actionLabel}>Copy both</Text>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Write another draft"
            onPress={rewrite}
            disabled={rewriting}
            style={[styles.rewrite, rewriting && styles.disabled]}
          >
            <Text style={styles.rewriteLabel}>
              {rewriting ? "Writing…" : "Write another"}
            </Text>
          </Pressable>

          <Text style={styles.footnote}>
            Nothing is sent by Andy. Copy this into whatever you use.
          </Text>
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
    opacity: 0.55,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: fonts.display,
    marginTop: 8,
  },
  subject: {
    color: colors.ink,
    fontSize: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: 8,
  },
  body: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 180,
    paddingVertical: 8,
  },
  copied: { color: colors.moss, fontSize: 13 },
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
  disabled: { opacity: 0.5 },
  footnote: {
    color: colors.ink,
    fontSize: 13,
    opacity: 0.55,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 4,
  },
});
