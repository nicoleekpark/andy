import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, disabledOpacity, fonts, radius, size, space, textOpacity, textSize } from "../constants/theme";
import { useLocked } from "../lib/lock-context";
import { DraftPanel, FORMATS, TONES, useDraftFields } from "./draft-sheet";
import { MAX_INSTRUCTION_CHARS } from "../../convex/emailPrompt";
import type { Draft, DraftStyle } from "./draft-sheet";

/**
 * Write to → Reach out (`docs/design/decisions/follow-up-redesign.md`,
 * decision 4; storyboard strip 4).
 *
 * One sheet with two faces: what to write from — the notes, the person's own
 * words, the tone — and then the draft. Nothing is written until **Write it**:
 * opening the sheet costs nothing, the reverse of the sheet before it, which
 * called Claude the moment it opened.
 *
 * Reply (paste or a screenshot) joins this sheet in a later slice, with the
 * door between them; until then Write to opens here directly.
 */

/** A note that can be ticked: its saved details, never its raw words. */
export type TickableNote = { id: string; date: string; facts: string[] };

export type ReachOutInputs = {
  noteIds: string[];
  /** Free-form text: what the person wants to say. */
  instruction: string;
  /** Selected quick-start intents (multiple allowed). */
  quickStarts: string[];
  style: DraftStyle;
};

/** `draft-quick-start` for Reach out: toggleable intents, separate from the field. */
const QUICK_STARTS = ["Check in", "Congratulate", "Follow up on our plan"] as const;

/**
 * Combine selected quick starts and free-form instruction into one string
 * for the server. The quick starts come first as a comma-separated list.
 */
export function combineInstruction(quickStarts: string[], instruction: string): string {
  const parts = [];
  if (quickStarts.length > 0) {
    parts.push(quickStarts.join(", "));
  }
  if (instruction.trim() !== "") {
    parts.push(instruction.trim());
  }
  return parts.join(". ");
}

/** Stands in before anything is written, so the fields hook always has a draft. */
const EMPTY_DRAFT: Draft = { personName: "", subject: "", body: "" };


type Props = {
  personName: string;
  notes: TickableNote[];
  inputs: ReachOutInputs;
  onChangeInputs: (next: ReachOutInputs) => void;
  /** The draft, once written; `null` shows the compose step. */
  written: { draft: Draft; intent: string; sources: string } | null;
  onWrite: () => void;
  /** Back from the draft to the compose step, inputs kept. */
  onBack: () => void;
  onChooseStyle: (style: DraftStyle) => void;
  onClose: () => void;
  writing: boolean;
  canWrite: boolean;
  error: string | null;
};

export function WriteToSheet({
  personName,
  notes,
  inputs,
  onChangeInputs,
  written,
  onWrite,
  onBack,
  onChooseStyle,
  onClose,
  writing,
  canWrite,
  error,
}: Props) {
  const locked = useLocked();
  // Above the modal for the same reason as `DraftSheet`: the lock hides it,
  // and a hidden modal unmounts what is inside — edits must survive that.
  const fields = useDraftFields(written?.draft ?? EMPTY_DRAFT);
  const somethingToWriteFrom =
    inputs.noteIds.length > 0 || inputs.quickStarts.length > 0 || inputs.instruction.trim() !== "";
  const ready = somethingToWriteFrom && canWrite && !writing;

  const toggleQuickStart = (start: string) =>
    onChangeInputs({
      ...inputs,
      quickStarts: inputs.quickStarts.includes(start)
        ? inputs.quickStarts.filter((one) => one !== start)
        : [...inputs.quickStarts, start],
    });

  const toggle = (id: string) =>
    onChangeInputs({
      ...inputs,
      noteIds: inputs.noteIds.includes(id)
        ? inputs.noteIds.filter((one) => one !== id)
        : [...inputs.noteIds, id],
    });

  return (
    // Hidden, not unmounted, while the app lock is up — the same reason as
    // `DraftSheet`: a native modal sits above the lock's cover.
    <Modal visible={!locked} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {written !== null ? (
        <DraftPanel
          title={`Reach out to ${personName}`}
          draft={written.draft}
          style={inputs.style}
          onChooseStyle={onChooseStyle}
          canWrite={canWrite}
          onClose={onClose}
          onBack={onBack}
          onRewrite={onWrite}
          rewriting={writing}
          error={error}
          intent={written.intent}
          sources={written.sources}
          fields={fields}
        />
      ) : (
        <View style={styles.fill}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} hitSlop={12}>
              <Text style={styles.headerAction}>Cancel</Text>
            </Pressable>
            <Text style={styles.title} accessibilityRole="header">
              Reach out to {personName}
            </Text>
            <View style={styles.headerSpacer} />
          </View>
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            testID="reach-out-compose"
          >
            <Text style={styles.label}>What you know about {personName}</Text>
            {notes.length === 0 ? (
              <Text style={styles.quiet} testID="reach-out-no-notes">
                Nothing written about {personName} yet.
              </Text>
            ) : (
              <View>
                {notes.map((note) => {
                  const checked = inputs.noteIds.includes(note.id);
                  return (
                    <Pressable
                      key={note.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      // Every write control waits while writing (follow-up-redesign.md §3).
                      disabled={writing}
                      accessibilityLabel={`${note.date}: ${note.facts.join(". ")}`}
                      onPress={() => toggle(note.id)}
                      style={styles.noteRow}
                      testID={`reach-out-note--${note.id}`}
                    >
                      <View style={[styles.box, checked && styles.boxOn]}>
                        {checked ? <Text style={styles.tick}>✓</Text> : null}
                      </View>
                      <View style={styles.noteWords}>
                        <Text style={styles.noteDate}>{note.date}</Text>
                        <Text style={styles.noteFacts}>{note.facts.join(", ")}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={[styles.chips, styles.gapAbove]}>
              {QUICK_STARTS.map((start) => {
                const selected = inputs.quickStarts.includes(start);
                return (
                  <Pressable
                    key={start}
                    accessibilityRole="checkbox"
                    accessibilityLabel={start}
                    accessibilityState={{ checked: selected }}
                    accessibilityHint="Nothing is written yet."
                    onPress={() => toggleQuickStart(start)}
                    disabled={writing}
                    style={[styles.quickStart, selected && styles.on, writing && styles.disabled]}
                    testID={`draft-quick-start--${start}`}
                  >
                    <Text style={[styles.quickStartLabel, selected && styles.optionLabelOn]}>{start}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              accessibilityLabel="What do you want to say?"
              placeholder="What do you want to say? (optional)"
              placeholderTextColor={colors.placeholder}
              value={inputs.instruction}
              onChangeText={(instruction) => onChangeInputs({ ...inputs, instruction })}
              maxLength={MAX_INSTRUCTION_CHARS}
              editable={!writing}
              multiline
              style={styles.say}
              testID="reach-out-say"
            />

            <View
              style={[styles.formatPicker, styles.gapAbove]}
              accessibilityRole="radiogroup"
              accessibilityLabel="Format"
              testID="reach-out-format-picker"
            >
              {FORMATS.map((format) => {
                const selected = inputs.style.format === format.value;
                return (
                  <Pressable
                    key={format.value}
                    accessibilityRole="radio"
                    accessibilityLabel={format.label}
                    accessibilityState={{ selected }}
                    onPress={() => onChangeInputs({ ...inputs, style: { ...inputs.style, format: format.value } })}
                    disabled={writing}
                    style={[styles.formatOption, selected && styles.on, writing && styles.disabled]}
                  >
                    <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>{format.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.label}>Tone</Text>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Tone">
              {TONES.map((tone) => {
                const selected = inputs.style.tone === tone.value;
                return (
                  <Pressable
                    key={tone.value}
                    accessibilityRole="radio"
                    accessibilityLabel={tone.label}
                    accessibilityState={{ selected }}
                    onPress={() => onChangeInputs({ ...inputs, style: { ...inputs.style, tone: tone.value } })}
                    disabled={writing}
                    style={[styles.chip, selected && styles.on, writing && styles.disabled]}
                    testID={`reach-out-tone-chip--${tone.value}`}
                  >
                    <Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>{tone.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {error !== null ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Write it"
              // Read with the control, not as a separate line VoiceOver may skip.
              accessibilityHint={
                !somethingToWriteFrom
                  ? "Tell Andy what you want to say."
                  : !canWrite
                    ? "Writing needs a connection."
                    : undefined
              }
              onPress={onWrite}
              disabled={!ready}
              style={[styles.cta, !ready && styles.disabled]}
              testID="generate-button"
            >
              <Text style={styles.ctaLabel}>{writing ? "Writing…" : "Write it"}</Text>
            </Pressable>
            {!somethingToWriteFrom ? (
              <Text style={styles.hint} testID="generate-hint">
                Tell Andy what you want to say.
              </Text>
            ) : !canWrite ? (
              <Text style={styles.hint}>Writing needs a connection.</Text>
            ) : null}
          </ScrollView>
        </View>
      )}
    </Modal>
  );
}

/**
 * The sources line for what came back (`draft-sources-line`, Reach out):
 * only what the draft actually used.
 */
export function reachOutSources(usedNotes: string[]): string {
  if (usedNotes.length === 0) return "Written from what you asked for.";
  if (usedNotes.length === 1) return `Written from your note of ${usedNotes[0]}.`;
  const last = usedNotes[usedNotes.length - 1];
  return `Written from your notes of ${usedNotes.slice(0, -1).join(", ")} and ${last}.`;
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
  headerAction: { color: colors.moss, fontSize: textSize.lg },
  headerSpacer: { width: size.touch },
  title: { color: colors.ink, fontSize: textSize.xl, flexShrink: 1, textAlign: "center" },
  content: { padding: space.xl, gap: space.sm, paddingBottom: space.xxxl },
  label: {
    color: colors.ink,
    fontSize: textSize.xs,
    opacity: textOpacity.quiet,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: fonts.display,
    marginTop: space.md,
  },
  gapAbove: { marginTop: space.md },
  quiet: { color: colors.ink, fontSize: textSize.base, opacity: textOpacity.quiet },
  noteRow: {
    flexDirection: "row",
    gap: space.md,
    paddingVertical: space.md,
    minHeight: size.touch,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  // An unticked box is only its outline: `edge`, 3:1.
  box: {
    width: size.icon,
    height: size.icon,
    borderRadius: radius.control / 2,
    borderWidth: 1,
    borderColor: colors.edge,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  tick: { color: colors.paper, fontSize: textSize.md, fontWeight: "600" },
  noteWords: { flex: 1, gap: space.xs },
  noteDate: { color: colors.ink, fontSize: textSize.sm, opacity: textOpacity.quiet },
  noteFacts: { color: colors.ink, fontSize: textSize.base },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  // Outlined in moss: tapping fills the field, it does not write.
  quickStart: {
    minHeight: size.touch,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.moss,
    justifyContent: "center",
  },
  quickStartLabel: { color: colors.moss, fontSize: textSize.base },
  // The field's only edge: `edge`, 3:1 (WCAG 1.4.11).
  say: {
    color: colors.ink,
    fontSize: textSize.lg,
    minHeight: size.touch * 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.edge,
    paddingTop: space.md,
    paddingBottom: space.sm,
    textAlignVertical: "top",
  },
  formatPicker: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.edge,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  formatOption: { flex: 1, minHeight: size.touch, alignItems: "center", justifyContent: "center" },
  chip: {
    minHeight: size.touch,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.edge,
    justifyContent: "center",
  },
  on: { backgroundColor: colors.moss, borderColor: colors.moss },
  optionLabel: { color: colors.ink, fontSize: textSize.base },
  optionLabelOn: { color: colors.paper },
  error: { color: colors.alert, fontSize: textSize.md },
  cta: {
    marginTop: space.lg,
    minHeight: size.touch,
    borderRadius: radius.pill,
    backgroundColor: colors.moss,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaLabel: { color: colors.paper, fontSize: textSize.lg, fontWeight: "600" },
  disabled: { opacity: disabledOpacity },
  hint: { color: colors.ink, fontSize: textSize.sm, opacity: textOpacity.quiet, textAlign: "center" },
});
