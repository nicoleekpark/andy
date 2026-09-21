import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import {
  countFactNotes,
  followUpRefusal,
} from "../../../../../convex/followUpScope";
import { DraftSheet } from "../../../../components/draft-sheet";
import * as FileSystem from "expo-file-system/legacy";
import { imageContentType } from "../../../../lib/media";
import type { Draft } from "../../../../components/draft-sheet";
import type { Doc, Id } from "@convex/_generated/dataModel";
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

  /**
   * Why a follow-up cannot be drafted for this person, or `null` when it can.
   *
   * Decided from what the screen already has — `withNotes` collects every note
   * rather than a page of them — so this costs no round trip, and by the same
   * function the action uses, so the button and the refusal cannot drift apart.
   */
  const followUpBlock = useMemo(() => {
    if (result === null || result === undefined) return null;
    return followUpRefusal({
      name: result.profile.name,
      entityType: result.profile.entityType,
      ownNoteCount: result.notes.length,
      factNoteCount: countFactNotes(result.notes.map((entry) => entry.note)),
      hasMentions: result.mentionedInTotal > 0,
    });
  }, [result]);

  const requestDraft = useAction(api.followUp.draft);
  /**
   * The draft on screen and which attempt produced it, or `null` when the
   * sheet is closed.
   *
   * Held here rather than on a route of its own: a draft is not addressable —
   * it exists for as long as the sheet is open and is deliberately not saved,
   * so a URL that could be returned to would be a URL that lied.
   *
   * One piece of state rather than two. The text and its attempt number have
   * to move together — the sheet is remounted on the number, which is how a
   * rewrite resets fields the user has typed in — and as two `useState`s that
   * held only because both setters happened to sit next to each other. Putting
   * them in one object is what makes it structural.
   */
  const [attempt, setAttempt] = useState<{ id: number; draft: Draft } | null>(
    null,
  );
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

  const generateUploadUrl = useMutation(api.photos.generateUploadUrl);
  const attachPhoto = useMutation(api.photos.attach);
  const removePhoto = useMutation(api.photos.remove);
  const [photoBusy, setPhotoBusy] = useState(false);

  /**
   * Pick a photo and put it on this person.
   *
   * Three steps and all three have to happen: ask for permission at the moment
   * of use, upload the bytes to Convex storage, then tell the profile which
   * file is now its own. Asked for here rather than on launch, per `CLAUDE.md`.
   */
  const choosePhoto = useCallback(async () => {
    if (photoBusy) return;
    setError(null);

    // No permission request first, deliberately. On iOS 14+ the picker runs
    // out-of-process through `PHPickerViewController` and needs no library
    // access to hand back one image the user chose — so asking buys read access
    // to somebody's entire photo library for nothing, and refusing on a "no"
    // denies a feature that would have worked anyway. Day 2 (finding 26) logged
    // the same call on the business-card path as unnecessary; this is the one
    // place not to add a second instance of it.
    //
    // If it turns out the picker does need permission on some build, it fails
    // here rather than silently — which is what the catch is for.
    let picked;
    try {
      picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        // Cropped on the way in, the same trick the business-card path uses. A
        // square is what the screen shows, and an uncropped 12MP frame is bytes
        // the user pays to store and never sees.
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
    } catch {
      setError(
        "Andy couldn't open your photos. You can grant access in Settings.",
      );
      return;
    }
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (asset === undefined) return;

    setPhotoBusy(true);
    try {
      const uploadUrl = await generateUploadUrl();

      // Uploaded natively from the file, rather than read into a JavaScript
      // `Blob` and posted with `fetch`.
      //
      // The blob version did not work and said `upload failed: 400`, twice,
      // and the second time was after the `Content-Type` it sends had been
      // fixed and verified against the deployment — so something between
      // React Native and the request was still not what curl sends. React
      // Native itself warns about the path:
      //
      //     Response.blob() is using React Native's Blob, which copies the
      //     response into the native blob store and reads it back through
      //     base64 encoding.
      //
      // A photo does not need to enter JavaScript at all. `uploadAsync` hands
      // the file to the platform's own uploader with the headers given here
      // and nothing in between — no blob store, no base64 round trip, and no
      // second place for a header to be rewritten. `expo-file-system` is a
      // dependency of `expo` itself, so this needs no new native module.
      const response = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        // Not `asset.mimeType` straight through. iOS hands back a uniform type
        // identifier — `public.jpeg` — often enough, and that is not a legal
        // header value: Convex answers `400 BadHeader`. See `imageContentType`.
        headers: {
          "Content-Type": imageContentType(asset.mimeType, asset.uri),
        },
      });
      if (response.status < 200 || response.status >= 300) {
        // The body, not just the status. Convex says which check refused —
        // `{"code":"BadHeader","message":"…"}` — and throwing only the number
        // is what turned one bug into three rounds of guessing.
        throw new Error(
          `upload failed: ${response.status} ${response.body.slice(0, 200)}`,
        );
      }
      // Convex hands back its own branded id; the upload endpoint is outside
      // the typed function surface, so this is the seam where it re-enters it.
      const { storageId } = JSON.parse(response.body) as {
        storageId: Id<"_storage">;
      };
      await attachPhoto({ profileId: id, storageId });
    } catch (thrown) {
      // The cause, in development only.
      //
      // "Andy couldn't save that photo. Try again." is the right thing to show
      // a person and the wrong thing to show the person fixing it: the upload
      // has four distinct ways to fail — reading the picked file, the POST,
      // its status, and the JSON — and the message erases which one happened.
      // This path had never run on a device before it was reported, and the
      // first thing anybody asked was "yes, but what actually failed".
      //
      // `__DEV__` is false in a release build, so what ships is the sentence
      // above and nothing else.
      const detail =
        __DEV__ && !(thrown instanceof ConvexError)
          ? ` (${thrown instanceof Error ? thrown.message : String(thrown)})`
          : "";
      setError(
        thrown instanceof ConvexError
          ? String(thrown.data)
          : `Andy couldn't save that photo. Try again.${detail}`,
      );
    } finally {
      setPhotoBusy(false);
    }
  }, [photoBusy, generateUploadUrl, attachPhoto, id]);

  const confirmRemovePhoto = useCallback(() => {
    Alert.alert(
      "Remove this photo?",
      "The photo is deleted. Their notes stay exactly as they are.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setError(null);
              try {
                await removePhoto({ profileId: id });
              } catch {
                setError("Andy couldn't remove that photo. Try again.");
              }
            })();
          },
        },
      ],
    );
  }, [removePhoto, id]);

  /**
   * Write a follow-up and put it on screen.
   *
   * Also the rewrite: `DraftSheet` calls this again for "Write another", which
   * is why the sheet is keyed on an attempt counter rather than on the text.
   */
  const draftFollowUp = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setDrafting(true);
    setError(null);
    try {
      const written = await requestDraft({
        profileId: id,
        // The device's date, not the server's. A follow-up that says "September"
        // to somebody for whom it is already October reads as inattentive, and
        // the deployment has no idea what day it is where the user is.
        today: new Date().toLocaleDateString("en-CA"),
      });

      // Counted rather than compared. A rewrite can legitimately come back
      // identical, and the sheet has to reset its fields either way — so the
      // thing that changes is the attempt, not the text.
      setAttempt((previous) => ({
        id: (previous?.id ?? 0) + 1,
        draft: written,
      }));
    } catch (thrown) {
      // Inline, not an alert. Every other error in this app is an inline line
      // in `colors.alert`; every `Alert` in it is a confirmation or a choice,
      // never a report. Nothing has navigated anywhere on either failure path,
      // so they are still looking at this screen — with the actions bar pinned
      // outside the scroll view, or the sheet open in front of it, so the line
      // is visible in both.
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
  }, [requestDraft, id]);
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
            {/*
              Above the name, at the size of a face rather than a hero image.
              `STYLE.md`'s grounding is "marginalia in a well-loved address
              book", and an address book shows a small photo beside a name — it
              does not open with a banner.

              Tappable either way: with a photo it offers to replace, without one
              it is the only way to add. A separate "Add a photo" button would be
              a control on every profile for something most will never have.
            */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                result.photoUrl === null ? "Add a photo" : "Replace photo"
              }
              onPress={choosePhoto}
              onLongPress={
                result.photoUrl === null ? undefined : confirmRemovePhoto
              }
              disabled={photoBusy}
              style={[styles.photo, photoBusy && styles.disabled]}
            >
              {result.photoUrl === null ? (
                <Text style={styles.photoEmpty}>
                  {photoBusy ? "…" : "+"}
                </Text>
              ) : (
                <Image
                  source={{ uri: result.photoUrl }}
                  style={styles.photoImage}
                  contentFit="cover"
                  accessibilityLabel={`Photo of ${result.profile.name}`}
                />
              )}
            </Pressable>

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
            {error !== null && attempt === null ? (
              <Text style={styles.actionError}>{error}</Text>
            ) : null}
            {/*
              Offered only where it can actually work, and the reason given
              where it cannot.

              Animals get neither the button nor a line: "record a note to draft
              a follow-up" is not advice anyone wants about a foster cat.
              Everyone else gets one or the other, because every way of failing
              here is reachable by ordinary use — most of all the person Andy
              invented from a mention, who has a note on screen and nothing this
              feature may use.
            */}
            {result.profile.entityType === "person" ? (
              followUpBlock === null ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Draft a follow-up"
                  onPress={draftFollowUp}
                  // No explicit `accessibilityState`: `Pressable` derives it
                  // from this prop. Saying it twice meant the test read the
                  // copy and passed with the real one deleted.
                  disabled={drafting}
                  style={[styles.addNote, drafting && styles.disabled]}
                >
                  <Text style={styles.addNoteLabel}>
                    {drafting ? "Writing…" : "Draft a follow-up"}
                  </Text>
                </Pressable>
              ) : (
                // Not an error colour. Nothing has gone wrong — this is the
                // app explaining what it would need, in the place the button
                // would have been.
                <Text testID="follow-up-unavailable" style={styles.actionNote}>
                  {followUpBlock}
                </Text>
              )
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

      {/*
        Mounted only while there is a draft, and keyed on the attempt rather
        than the text. A rewrite can come back word-for-word identical and the
        fields still have to reset to it — remounting is the whole reset, so
        nothing has to remember to clear.
      */}
      {attempt !== null ? (
      <DraftSheet
        key={attempt.id}
        draft={attempt.draft}
        onClose={() => {
          setAttempt(null);
          setError(null);
        }}
        onRewrite={draftFollowUp}
        rewriting={drafting}
        error={error}
      />
      ) : null}
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
  photo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 12,
  },
  photoImage: { width: "100%", height: "100%" },
  photoEmpty: { color: colors.ink, fontSize: 24, opacity: 0.35 },
  actionNote: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.6,
    marginHorizontal: 24,
  },
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
