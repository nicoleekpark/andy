import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { colors, fonts } from "@/constants/theme";

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

  const draftEmail = useAction(api.followUp.draft);
  const [drafting, setDrafting] = useState(false);
  /**
   * A latch, not a second copy of `drafting`.
   *
   * `disabled` on the button is the affordance and is what a test can see, but
   * it only takes effect after React commits the state — and on a device two
   * native touches can land inside that window. This is a paid Claude call, so
   * the extra two lines buy something real. They are not a doubled guard:
   * `disabled` greys the button, this stops the call.
   */
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Write a follow-up and hand it to Mail.
   *
   * Everything a person sees here they see in Mail, not in a preview this app
   * would have to build — which is `PROJECT_SCOPE.md`'s shape and also the
   * better review step: it is the actual message, fully editable, and nothing
   * is sent until Send is pressed.
   */
  const draftFollowUp = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDrafting(true);
    setError(null);
    try {
      const written = await draftEmail({
        profileId: id,
        // The device's date, not the server's. A follow-up that says "September"
        // to somebody for whom it is already October reads as inattentive, and
        // the deployment has no idea what day it is where the user is.
        today: new Date().toLocaleDateString("en-CA"),
      });

      const mail = `mailto:?subject=${encodeURIComponent(
        written.subject,
      )}&body=${encodeURIComponent(written.body)}`;

      try {
        await Linking.openURL(mail);
      } catch {
        // Not `canOpenURL` first. On iOS that returns false for any scheme
        // missing from `LSApplicationQueriesSchemes`, and `app.json` has no
        // `infoPlist` block at all — so if `mailto` turned out not to be
        // exempt, every tap would say "no mail app" and the whole feature
        // would be dead with every test still green. `openURL` rejects on its
        // own, which gets the same message from the thing that actually failed.
        setError(
          "Andy wrote the draft, but there's no mail app set up to open it in. Set one up and tap again.",
        );
      }
    } catch (thrown) {
      // Inline, not an alert. Every other error in this app is an inline line
      // in `colors.alert`; every `Alert` in it is a confirmation or a choice,
      // never a report. And the "they might be in Mail by now" argument does
      // not hold — on both failure paths Mail never opened, so they are still
      // looking at this screen, with the actions bar pinned outside the scroll
      // view so the line is guaranteed to be visible.
      //
      // The server's own words when they were written for a person; "there's
      // nothing written down about them yet" is the common one. Never the raw
      // error.
      setError(
        thrown instanceof ConvexError
          ? String(thrown.data)
          : "Andy couldn't reach that just now. Try again.",
      );
    } finally {
      inFlight.current = false;
      setDrafting(false);
    }
  }, [draftEmail, id]);
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
      <Stack.Screen
        options={{
          title,
          headerRight: () =>
            // Only once there is somebody to edit. Offering it over a
            // not-found screen would be a button that can only fail.
            result === undefined || result === null ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit this person"
                onPress={() => router.push(`/profile/${id}/edit`)}
                hitSlop={12}
              >
                <Text style={styles.headerAction}>Edit</Text>
              </Pressable>
            ),
        }}
      />
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

            {/* Under the name, because that is what they are: other ways of
                saying it. Not a chip like a tag — these are not categories. */}
            {result.profile.aliases && result.profile.aliases.length > 0 ? (
              <Text style={styles.meta}>
                also {result.profile.aliases.join(", ")}
              </Text>
            ) : null}

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
                          <View style={styles.entryActions}>
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
                            {/* Its own control rather than making the whole
                                entry tappable: the entry already has a toggle,
                                and a row that both expands and navigates
                                depending on where you land on it is a row you
                                learn to distrust. */}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Edit the note from ${new Date(note.createdAt).toLocaleDateString("en-CA")}`}
                              onPress={() => router.push(`/note/${note._id}`)}
                              hitSlop={8}
                            >
                              <Text style={styles.reveal}>Edit</Text>
                            </Pressable>
                          </View>
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
                          {mentions.map((mention) => {
                            const line = (
                              <Text
                                style={
                                  mention.exists
                                    ? styles.mentionName
                                    : styles.mentionGone
                                }
                              >
                                {mention.name}
                                {mention.quote ? (
                                  <Text style={styles.quiet}>
                                    {" "}
                                    — {mention.quote}
                                  </Text>
                                ) : null}
                              </Text>
                            );
                            // Deleted people keep their place in the note but
                            // stop being a link. Rendering a button that leads
                            // to a missing profile would promise something the
                            // app cannot do; removing the name would rewrite
                            // what this note said.
                            return mention.exists ? (
                              <Pressable
                                key={mention.profileId}
                                accessibilityRole="button"
                                accessibilityLabel={`Open ${mention.name}`}
                                onPress={() =>
                                  router.push(`/profile/${mention.profileId}`)
                                }
                              >
                                {line}
                              </Pressable>
                            ) : (
                              <View key={mention.profileId}>{line}</View>
                            );
                          })}
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
          <View style={styles.actions}>
            {error !== null ? (
              <Text style={styles.actionError}>{error}</Text>
            ) : null}
            {/*
              No preview screen between here and Mail, and that is the scope
              document's shape rather than a shortcut: "generate a draft from
              stored notes, hand off via `mailto:` deep link". Mail's own compose
              window is the review step, and it is a better one than anything
              this app would build — it is the actual thing that gets sent, fully
              editable, and nothing leaves until Send is pressed.

              The To line is left empty. This app does not read Contacts, and V1
              stores no address, so Mail's own autocomplete is the honest place
              for that.
            */}
            {/*
              People only. "Draft a follow-up" on a foster cat would send that
              animal's health notes into a Claude call and a compose window
              addressed to the cat by name — not a leak, but a trip the data has
              no reason to take, and a button that makes the app look like it is
              not reading what it stores.
            */}
            {result.profile.entityType === "person" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Draft a follow-up"
              onPress={draftFollowUp}
              // No explicit `accessibilityState`: `Pressable` derives it from
              // this prop. Saying it twice meant the test read the copy and
              // passed with the real one deleted.
              disabled={drafting}
              style={[styles.addNote, drafting && styles.disabled]}
            >
              <Text style={styles.addNoteLabel}>
                {drafting ? "Writing…" : "Draft a follow-up"}
              </Text>
            </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a note"
              onPress={() => router.push(`/profile/${id}/capture`)}
              style={styles.addNote}
            >
              <Text style={styles.addNoteLabel}>Add a note</Text>
            </Pressable>
          </View>
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

  headerAction: { color: colors.ink, fontSize: 15 },
  name: { color: colors.ink, fontSize: 28, fontFamily: fonts.displayMedium },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  meta: { color: colors.ink, fontSize: 14, opacity: 0.6 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.utility,
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
  date: {
    color: colors.ink,
    fontSize: 12,
    opacity: 0.5,
    fontFamily: fonts.utility,
  },
  fact: { color: colors.ink, fontSize: 16, lineHeight: 24 },

  actions: { gap: 10, marginBottom: 24 },
  addNote: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginHorizontal: 24,
    backgroundColor: colors.paper,
  },
  // Named like every other disabled state in this app rather than for the one
  // button that first needed it.
  disabled: { opacity: 0.5 },
  actionError: {
    color: colors.alert,
    fontSize: 14,
    lineHeight: 20,
    marginHorizontal: 24,
  },
  addNoteLabel: { color: colors.ink, fontSize: 15 },

  entryActions: { flexDirection: "row", gap: 16, alignItems: "center" },
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
  /** Ink rather than moss: still part of the note, no longer a way anywhere. */
  mentionGone: { color: colors.ink, fontSize: 14, opacity: 0.75 },

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
    fontFamily: fonts.display,
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
