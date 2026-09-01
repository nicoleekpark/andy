import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { colors } from "@/constants/theme";

/**
 * Correcting a note after it is saved.
 *
 * The capture screen's confirm step is reachable exactly once, before the
 * write, and two failures measured on real recordings get past it: extraction
 * attributing a fact to the wrong person ("어머니가 많이 힘들어하신다" saved as
 * "어머니 때문에 힘들어한다", moving the hardship onto whoever the note was
 * filed under), and recognition mishearing a syllable that changes a sentence's
 * grammar (`하신대` → `하신데`, which is what made the first one possible). Both
 * were caught by a person reading the screen. Neither could be fixed
 * afterwards, which made catching them worth nothing.
 *
 * Its own screen rather than editing in place on the timeline: the timeline is
 * for reading a person, and turning every line of it into a field would make
 * the common case — scrolling someone's history — feel like a form.
 *
 * A separate screen from the capture review, too, despite editing the same
 * fields. That screen edits a *draft*, where the profile and the note are one
 * object being created together; here they are two saved rows with different
 * owners of truth, and folding them into one screen would mean pretending a
 * note's name and a profile's name are the same thing.
 */
export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useQuery(api.notes.byId, { noteId: id });
  const updateNote = useMutation(api.notes.updateNote);
  const removeNote = useMutation(api.notes.remove);

  /**
   * What the user has changed, or `null` while they have changed nothing.
   *
   * Derived at render from the saved row rather than copied into state by an
   * effect. Copying would need the effect to know whether it is seeding or
   * overwriting, and it gets that wrong the moment any other query on the
   * shared Convex client settles mid-edit — the row arrives again and the
   * effect helpfully replaces what is being typed. Here the saved row is only
   * ever a fallback: once there are edits, they win, and until then the screen
   * shows whatever is currently stored.
   */
  const [edits, setEdits] = useState<{
    text: string;
    keyFacts: string[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved =
    result === undefined || result === null
      ? null
      : { text: result.note.text, keyFacts: result.note.keyFacts ?? [] };
  const working = edits ?? saved;

  /**
   * Every edit writes the whole working copy, so the first keystroke on any
   * field carries the rest of the saved row with it. Editing one field through
   * a patch that only knew about that field would leave the others undefined
   * and quietly blank them on save.
   */
  function edit(patch: Partial<{ text: string; keyFacts: string[] }>) {
    if (working === null) {
      return;
    }
    setEdits({ ...working, ...patch });
  }

  const profileId = result === undefined || result === null ? null : result.note.profileId;

  const save = useCallback(async () => {
    if (working === null) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateNote({ noteId: id, ...working });

      // Normally this screen was opened from the timeline it edits, so closing
      // it puts the corrected note back in view — Convex queries are live, so
      // what is underneath already shows the change. Opened straight from a
      // link there is nothing beneath, and dispatching a back that cannot
      // happen throws; the note's own profile is the honest destination.
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/profile/${profileId}`);
      }
    } catch (e) {
      // The mutation's ConvexError messages are written for this screen, so
      // they are shown as they are; anything else gets a plain line.
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Andy couldn't save that change. Try again.",
      );
      setSaving(false);
    }
  }, [id, working, updateNote, profileId]);

  /**
   * Deleting, behind a confirmation, because it cannot be undone.
   *
   * Always leaves for the profile rather than closing the screen: `back()`
   * would reveal the timeline this note was on, which is right after an edit
   * and wrong here — the entry it came from no longer exists, and returning to
   * a list that is missing the row you were just reading is disorienting. The
   * profile is the same destination either way, reached forwards.
   */
  const confirmDelete = useCallback(() => {
    Alert.alert(
      "Delete this note?",
      "The note and what it recorded go for good. People it mentioned keep their own notes.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setError(null);
              try {
                const { profileId: leftBehind } = await removeNote({ noteId: id });
                router.replace(`/profile/${leftBehind}`);
              } catch (e) {
                setError(
                  e instanceof Error && e.message
                    ? e.message
                    : "Andy couldn't delete that note. Try again.",
                );
              }
            })();
          },
        },
      ],
    );
  }, [id, removeNote]);

  if (result === undefined || result === null) {
    return (
      <>
        <Stack.Screen options={{ title: "Note" }} />
        <View style={[styles.container, styles.onlyStatus]}>
          <Text style={styles.quiet}>
            {result === undefined
              ? "Loading…"
              : "Andy doesn't have a note by that link."}
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{ title: result.profileName || "Note" }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.lead}>
          {new Date(result.note.createdAt).toLocaleDateString("en-CA")} · fix
          anything Andy got wrong.
        </Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>What to remember</Text>
          {working !== null && working.keyFacts.length > 0 ? (
            working.keyFacts.map((fact, index) => (
              <TextInput
                key={index}
                value={fact}
                onChangeText={(value) =>
                  edit({
                    keyFacts: working.keyFacts.map((fact, i) =>
                      i === index ? value : fact,
                    ),
                  })
                }
                style={styles.input}
                multiline
                accessibilityLabel={`Fact ${index + 1}`}
              />
            ))
          ) : (
            // Nothing extracted from this note, which is what a typed note
            // looks like. Saying so beats an empty gap that reads as a bug.
            <Text style={styles.quiet}>
              Nothing was pulled out of this one — the note itself is below.
            </Text>
          )}
          <View style={styles.factActions}>
            <Text style={styles.hint}>Clearing a line removes that fact.</Text>
            {/*
              The other half of editing. A note whose facts can only shrink is
              one you cannot correct by adding what extraction missed, which is
              most of what is wrong with a note weeks later.
            */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a fact"
              onPress={() =>
                edit({ keyFacts: [...(working?.keyFacts ?? []), ""] })
              }
              hitSlop={8}
            >
              <Text style={styles.addLine}>Add a fact</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            {result.note.source === "business_card"
              ? "What the card said"
              : result.note.source === "manual"
                ? "What you wrote"
                : "What you said"}
          </Text>
          <TextInput
            value={working?.text ?? ""}
            onChangeText={(value) => edit({ text: value })}
            style={[styles.input, styles.textInput]}
            multiline
            accessibilityLabel="Note text"
          />
          <Text style={styles.hint}>
            Correcting this does not re-read the facts above — those are yours
            to edit.
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save changes"
          onPress={save}
          disabled={saving}
          style={[styles.save, saving && styles.disabled]}
        >
          <Text style={styles.saveLabel}>
            {saving ? "Saving…" : "Save changes"}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete this note"
          onPress={confirmDelete}
          disabled={saving}
          style={styles.delete}
        >
          {/* `alert`, and the only place in the app that uses it: STYLE.md
              reserves it for errors, and a control that destroys something is
              the one non-error that has earned the same weight. Plain text
              rather than a filled button, so it does not compete with Save. */}
          <Text style={styles.deleteLabel}>Delete this note</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 24, gap: 24, paddingBottom: 40 },
  onlyStatus: { justifyContent: "center", alignItems: "center", padding: 24 },

  lead: { color: colors.ink, fontSize: 14, opacity: 0.6, lineHeight: 21 },

  field: { gap: 8 },
  fieldLabel: {
    color: colors.ink,
    fontSize: 12,
    opacity: 0.55,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    color: colors.ink,
    fontSize: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: 8,
  },
  textInput: { fontSize: 15, lineHeight: 22 },
  hint: { color: colors.ink, fontSize: 12, opacity: 0.5, flex: 1 },
  factActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  addLine: { color: colors.moss, fontSize: 13 },
  quiet: { color: colors.ink, fontSize: 15, opacity: 0.6, lineHeight: 22 },
  error: { color: colors.alert, fontSize: 14, lineHeight: 21 },

  save: {
    backgroundColor: colors.moss,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveLabel: { color: colors.paper, fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.5 },

  delete: { alignItems: "center", paddingVertical: 8 },
  deleteLabel: { color: colors.alert, fontSize: 15 },
});
