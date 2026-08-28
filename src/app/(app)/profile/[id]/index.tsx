import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { colors } from "@/constants/theme";

/**
 * A person, and everything recorded about them, newest first.
 *
 * This is the app's first `useQuery` on user data, which is why the identity-
 * scoped Convex client in `src/app/_layout.tsx` had to land before it: the query
 * cache is keyed by function and arguments and not by who asked, so without that
 * boundary this screen is exactly where one account's rows would appear under
 * another account's session.
 *
 * The vertical thread down the left is the one structural flourish STYLE.md
 * allows, and only here: notes are genuinely sequential, so a line connecting
 * them carries information rather than decoration.
 */
export default function ProfileScreen() {
  // useLocalSearchParams, not useGlobalSearchParams: this only re-renders while
  // the screen is focused, instead of on every global URL change.
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useQuery(api.profiles.withNotes, { profileId: id });

  /**
   * Which notes are showing what was actually said.
   *
   * The facts are the body because they are what a person confirmed; the
   * transcript is what the recogniser heard, and the two drift on purpose —
   * correcting a fact does not rewrite the note. But the original has to stay
   * reachable, because it is the only way to check a fact that looks wrong, and
   * transcription is measurably unreliable on exactly the details worth
   * checking. Collapsed rather than absent.
   */
  const [openTranscripts, setOpenTranscripts] = useState<string[]>([]);
  const toggleTranscript = useCallback((noteId: string) => {
    setOpenTranscripts((open) =>
      open.includes(noteId)
        ? open.filter((id) => id !== noteId)
        : [...open, noteId],
    );
  }, []);

  const title = result?.profile.name ?? "Profile";

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {result === undefined ? (
          // `undefined` is Convex's "still loading", distinct from the `null`
          // the query returns for a profile that isn't there or isn't yours.
          <Text style={styles.quiet}>Loading…</Text>
        ) : result === null ? (
          <Text style={styles.quiet}>
            Andy doesn&apos;t have anyone by that link.
          </Text>
        ) : (
          <>
            <Text style={styles.name}>{result.profile.name}</Text>

            <View style={styles.metaRow}>
              {result.profile.relationshipContext ? (
                <Text style={styles.meta}>
                  {result.profile.relationshipContext}
                </Text>
              ) : null}
              {result.profile.entityType === "animal" ? (
                <Text style={styles.meta}>animal</Text>
              ) : null}
              {result.profile.firstMetDate ? (
                <Text style={styles.meta}>
                  first met {result.profile.firstMetDate}
                </Text>
              ) : null}
            </View>

            {result.profile.tags.length > 0 ? (
              <View style={styles.chips}>
                {result.profile.tags.map((tag, index) => (
                  <Text key={`${tag}-${index}`} style={styles.chip}>
                    {tag}
                  </Text>
                ))}
              </View>
            ) : null}

            {/*
              The profile is where you notice something is missing, so it is
              where adding a note belongs. PROJECT_SCOPE.md's User Flow already
              routes here: /profile/[id]/capture is "pre-scoped to this
              profile". The scoping itself is not built — capture still works
              out who a note is about from what is said — so this is navigation,
              not yet a promise that the note lands on this person.
            */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a note"
              onPress={() => router.push(`/profile/${id}/capture`)}
              style={styles.addNote}
            >
              <Text style={styles.addNoteLabel}>Add a note</Text>
            </Pressable>

            {result.notes.length === 0 ? (
              <Text style={styles.quiet}>
                Nothing recorded yet.
              </Text>
            ) : (
              <View style={styles.timeline}>
                {result.notes.map((note) => (
                  <View key={note._id} style={styles.entry}>
                    <View style={styles.thread}>
                      <View style={styles.dot} />
                      <View style={styles.line} />
                    </View>
                    <View style={styles.entryBody}>
                      <Text style={styles.date}>
                        {new Date(note.createdAt).toLocaleDateString("en-CA")}
                      </Text>
                      {note.keyFacts && note.keyFacts.length > 0 ? (
                        <>
                          {note.keyFacts.map((fact, index) => (
                            <Text key={index} style={styles.fact}>
                              {fact}
                            </Text>
                          ))}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              openTranscripts.includes(note._id)
                                ? `Hide what you said on ${new Date(note.createdAt).toLocaleDateString("en-CA")}`
                                : `Show what you said on ${new Date(note.createdAt).toLocaleDateString("en-CA")}`
                            }
                            onPress={() => toggleTranscript(note._id)}
                            hitSlop={8}
                          >
                            <Text style={styles.reveal}>
                              {openTranscripts.includes(note._id)
                                ? "Hide what you said"
                                : "What you said"}
                            </Text>
                          </Pressable>
                          {openTranscripts.includes(note._id) ? (
                            <Text style={styles.transcript}>{note.text}</Text>
                          ) : null}
                        </>
                      ) : (
                        // No facts means nothing was extracted from this note,
                        // so the note *is* its text — there is no original to
                        // reveal separately.
                        <Text style={styles.fact}>{note.text}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 24, gap: 16, paddingBottom: 48 },

  name: { color: colors.ink, fontSize: 28 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  meta: { color: colors.ink, fontSize: 14, opacity: 0.6 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    color: colors.ink,
    fontSize: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },

  timeline: { gap: 4 },
  entry: { flexDirection: "row", gap: 12 },
  /** The connecting thread: a marker per note, a line joining them. */
  thread: { alignItems: "center", width: 10 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.moss,
    marginTop: 7,
  },
  line: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  entryBody: { flex: 1, paddingBottom: 20, gap: 4 },
  date: { color: colors.ink, fontSize: 12, opacity: 0.5 },
  fact: { color: colors.ink, fontSize: 16, lineHeight: 24 },

  addNote: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  addNoteLabel: { color: colors.ink, fontSize: 15 },

  reveal: { color: colors.moss, fontSize: 13, paddingTop: 4 },
  transcript: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.7,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.line,
    paddingLeft: 10,
    marginTop: 2,
  },

  quiet: { color: colors.ink, fontSize: 15, opacity: 0.6, lineHeight: 22 },
});
