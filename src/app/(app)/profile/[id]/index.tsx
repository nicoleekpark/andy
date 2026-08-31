import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { colors } from "@/constants/theme";

/**
 * What to call a note's body, given the door the note came through.
 *
 * "What you said" is simply untrue on a note captured from a business card —
 * nobody said it, it was read off a card — and being able to check a fact
 * against its source is the entire reason the body stays reachable. A label
 * that misnames the source defeats the control it opens.
 *
 * `source` is already on every note (`notes.source`, required since the table
 * was defined), so this needs nothing new from the backend. A voice note and a
 * calendar nudge are both spoken into the app, so they share a label; anything
 * added later lands on that same default until it earns wording of its own,
 * which is the safe direction to be wrong in.
 */
function bodyLabel(source: Doc<"notes">["source"]): string {
  switch (source) {
    case "business_card":
      return "What the card said";
    case "manual":
      return "What you wrote";
    default:
      return "What you said";
  }
}

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
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            result === undefined || result === null ? styles.contentOnlyStatus : null,
          ]}
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

            {result.notes.length === 0 ? (
              <Text style={styles.quiet}>
                Nothing recorded yet.
              </Text>
            ) : (
              <View style={styles.timeline}>
                {result.notes.map(({ note, mentions }) => (
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
                            accessibilityLabel={`${
                              openTranscripts.includes(note._id)
                                ? "Hide"
                                : "Show"
                            } ${bodyLabel(note.source).toLowerCase()} on ${new Date(note.createdAt).toLocaleDateString("en-CA")}`}
                            onPress={() => toggleTranscript(note._id)}
                            hitSlop={8}
                          >
                            <Text style={styles.reveal}>
                              {/* The chevron carries the state so the label can
                                  stay put — a control whose text and meaning
                                  both change reads as two different controls. */}
                              {openTranscripts.includes(note._id) ? "▾" : "▸"}{" "}
                              {bodyLabel(note.source)}
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

                      {mentions.length > 0 ? (
                        <View style={styles.mentions}>
                          {/* Without a label a name just hangs under the facts
                              and reads as one of them. */}
                          <Text style={styles.sectionLabel}>Also came up</Text>
                          {mentions.map((mention) => (
                            <Pressable
                              key={mention.profileId}
                              accessibilityRole="button"
                              accessibilityLabel={`Open ${mention.name}`}
                              onPress={() =>
                                router.push(`/profile/${mention.profileId}`)
                              }
                            >
                              <Text style={styles.mentionName}>
                                {mention.name}
                                {mention.quote ? (
                                  <Text style={styles.quiet}>
                                    {" "}
                                    — {mention.quote}
                                  </Text>
                                ) : null}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {result.mentionedIn.length > 0 ? (
              <View style={styles.backlinks}>
                <View style={styles.backlinkHeader}>
                  <Text style={styles.sectionLabel}>Mentioned in</Text>
                  {result.mentionedInTotal > result.mentionedIn.length ? (
                    // Only when some are missing: a count next to a complete
                    // list is noise, next to a truncated one it is the point.
                    <Text style={styles.sectionLabel}>
                      {result.mentionedIn.length} of {result.mentionedInTotal}
                    </Text>
                  ) : null}
                </View>
                {result.mentionedIn.map((entry) => (
                  <Pressable
                    key={entry.noteId}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${entry.aboutName}`}
                    onPress={() =>
                      router.push(`/profile/${entry.aboutProfileId}`)
                    }
                    style={styles.backlink}
                  >
                    <Text style={styles.rowMeta}>
                      {entry.aboutName} ·{" "}
                      {new Date(entry.createdAt).toLocaleDateString("en-CA")}
                    </Text>
                    {entry.quote ? (
                      <Text style={styles.transcript}>{entry.quote}</Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        )}
        </ScrollView>

        {/*
          Pinned rather than scrolled away with the header. The name stays
          visible in the navigation bar on its own, so the only thing worth
          holding on screen is the way to add to the timeline — and freezing the
          whole header block instead would spend a quarter of the screen on a
          screen you came to read. Matches home's Record button, same place.

          PROJECT_SCOPE.md's User Flow routes here: /profile/[id]/capture is
          "pre-scoped to this profile". The scoping itself is not built —
          capture still works out who a note is about from what is said — so
          this is navigation, not yet a promise the note lands on this person.
        */}
        {result !== null && result !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a note"
            onPress={() => router.push(`/profile/${id}/capture`)}
            style={styles.addNote}
          >
            <Text style={styles.addNoteLabel}>Add a note</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 24, gap: 16, paddingBottom: 24 },
  /** A screen holding one status line centres it rather than hanging it from
      the top edge, where it reads as a page that stopped loading. */
  contentOnlyStatus: { flexGrow: 1, justifyContent: "center" },

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
    paddingVertical: 14,
    alignItems: "center",
    marginHorizontal: 24,
    marginBottom: 24,
    backgroundColor: colors.paper,
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

  mentions: { paddingTop: 6, gap: 4 },
  mentionName: { color: colors.moss, fontSize: 14 },

  backlinkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backlinks: {
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 16,
  },
  sectionLabel: {
    color: colors.ink,
    fontSize: 12,
    opacity: 0.55,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  backlink: { gap: 3 },
  rowMeta: { color: colors.moss, fontSize: 14 },

  quiet: {
    color: colors.ink,
    fontSize: 15,
    opacity: 0.6,
    lineHeight: 22,
    textAlign: "center",
  },
});
