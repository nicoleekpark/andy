import { Stack, router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Draft } from "@convex/extractionPrompt";
import { colors } from "@/constants/theme";

/**
 * Voice capture, end to end: speak → transcript → draft → confirm → saved.
 *
 * The confirm step in the middle is not a convenience. Measured on 2026-08-27,
 * on-device Korean recognition gets sentence structure and names right but
 * mangles domain terms — "브랜딩 디자이너" came back as "브랜든 집 디자인" — and
 * extraction then records the mangled version as a fact and infers a
 * specialisation that appears nowhere in what was said. The structure survives
 * transcription errors; the truth of individual facts does not. Since these
 * facts are read back before a meeting as if true, nothing may be written
 * without a person seeing it first. See PROJECT_SCOPE.md's Open Risks.
 *
 * Recognition runs through Apple's SFSpeechRecognizer via expo-speech-recognition.
 * The library cannot *guarantee* on-device processing — when a locale has no
 * on-device model, `requiresOnDeviceRecognition` silently falls back to Apple's
 * servers rather than erroring (jamsch/expo-speech-recognition#169). That is why
 * the permission strings promise transcription, not privacy.
 *
 * The one `useQuery` here reads who the note is about, and it was blocked until
 * the client became identity-scoped: Convex's query cache is not keyed by who
 * asked, so the first query on user data could paint the previous account's
 * rows for the next person to sign in. That boundary now exists in
 * `src/app/_layout.tsx`, which is what makes pre-scoping possible at all.
 *
 * It is `profiles.withNotes` rather than a narrower "just the name" query on
 * purpose. That function already carries the ownership check this needs, and
 * a second query re-implementing it is a second place for it to be got wrong;
 * the screen this one is reached from has usually just run it with the same
 * argument, so it is normally a cache hit rather than a round trip.
 */

/**
 * Korean is the default because it is the case this app has to get right and
 * the one PROJECT_SCOPE.md flags as a risk; English recognition is the easy
 * case. Reading the device's preferred locale instead would be the real answer
 * and needs a locale picker anyway — deferred, deliberately, not forgotten.
 */
const DEFAULT_LOCALE = "ko-KR";

type Phase =
  | "idle"
  | "starting"
  | "listening"
  | "extracting"
  | "review"
  | "saving";

/**
 * What separates two people who share a name: how you know them, how much is
 * recorded, and when you last added to it. Written once because the candidate
 * button shows it and its accessibility label repeats it — two copies would
 * drift, and the screen-reader version is the one nobody notices going stale.
 */
function describe(candidate: {
  relationshipContext?: string;
  entityType: "person" | "animal";
  noteCount: number;
  lastNoteAt: number | null;
}): string {
  return [
    candidate.relationshipContext,
    candidate.entityType === "animal" ? "animal" : null,
    `${candidate.noteCount} ${candidate.noteCount === 1 ? "note" : "notes"}`,
    candidate.lastNoteAt === null
      ? "never written about"
      : `last ${new Date(candidate.lastNoteAt).toLocaleDateString("en-CA")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The user's own calendar date, not the server's — "오늘" means their today. */
function localToday(): string {
  // en-CA formats as YYYY-MM-DD, which is the shape the extraction prompt
  // expects, while still resolving in the device's timezone.
  return new Date().toLocaleDateString("en-CA");
}

export function CaptureScreen({ profileId }: { profileId?: string }) {
  /**
   * Who this note is about, when the route already said.
   *
   * Deciding the subject *before* speaking is the point: a note recorded on
   * 지선's page while talking entirely about her mother is still a note about
   * 지선, and no amount of prompting can work that out from the words alone.
   * The name goes to extraction, which files everyone else as a mention.
   *
   * `"skip"` when there is no profile in the route, so capture from home does
   * not run a query it has no argument for.
   */
  const scoped = useQuery(
    api.profiles.withNotes,
    profileId === undefined ? "skip" : { profileId },
  );
  // Guarded on `profileId` rather than trusting `scoped` to be undefined when
  // the query is skipped: the subject must come from the route, so the route is
  // what decides whether there is one.
  const aboutName =
    profileId === undefined ? undefined : scoped?.profile.name;
  /** The route named a profile the user does not have, or does not own. */
  const scopeMissing = profileId !== undefined && scoped === null;
  /** Still resolving. Recording now would extract without the subject. */
  const scopeLoading = profileId !== undefined && scoped === undefined;

  /**
   * Names in this draft that more than one of the user's people answer to.
   *
   * Two 치선s is ordinary — a name saved by ear turns out to be spelled the way
   * somebody else's already is — and a spoken name is then not enough to say
   * who a note is about. Asking here is the only place the question can be
   * answered: the person who was in the room is standing in front of the
   * screen. `saveCapture` refuses to guess if this is skipped.
   */
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  const extract = useAction(api.extraction.fromTranscript);
  const readCard = useAction(api.extraction.fromBusinessCard);
  const saveCapture = useMutation(api.notes.saveCapture);

  const [phase, setPhase] = useState<Phase>("idle");
  /** Finalised text, accumulated across the utterances of one recording. */
  const [finalText, setFinalText] = useState("");
  /** The in-flight guess, replaced on every event until it finalises. */
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The draft under review — a working copy the user edits before it is saved. */
  const [draft, setDraft] = useState<Draft | null>(null);

  const namesInDraft =
    draft === null
      ? []
      : [draft.primary.name, ...draft.mentions.map((m) => m.name)]
          .map((name) => name.trim())
          .filter((name) => name !== "");
  const asked = useQuery(
    api.profiles.resolveNames,
    draft === null ? "skip" : { names: namesInDraft },
  );
  // Memoised so the `?? []` fallback does not manufacture a new array on every
  // render and rebuild `save` with it, which would make the callback's identity
  // change constantly for no reason.
  const resolved = useMemo(() => asked ?? [], [asked]);
  /** Names two or more people answer to — the ones only the user can settle. */
  const ambiguous = useMemo(
    () => resolved.filter((one) => one.candidates.length > 1),
    [resolved],
  );
  /**
   * What saving does with the subject: adds to somebody, or invents them.
   *
   * `undefined` while the answer has not arrived, so the screen can say nothing
   * rather than flash "New person" at every draft before the query lands.
   */
  const primaryFate =
    draft === null || asked === undefined
      ? undefined
      : (resolved.find(
          (one) => one.name === draft.primary.name.trim(),
        )?.candidates ?? []);
  /** Every question answered, so saving cannot land on a coin toss. */
  const allAnswered = ambiguous.every(
    (question) => resolutions[question.name] !== undefined,
  );

  /**
   * The transcript this draft came from, frozen at the moment extraction
   * started. Held in state, not read off `finalRef` during render: a ref's
   * `current` is not a render input, so reading it to draw the review screen
   * would not re-render when it changed.
   */
  const [transcript, setTranscript] = useState("");
  /**
   * Which front door this capture came through. The draft and the save path are
   * identical either way — this only decides what the note body is called on
   * screen and what `notes.source` records.
   */
  const [source, setSource] = useState<"voice" | "business_card">("voice");

  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [preferOnDevice, setPreferOnDevice] = useState(true);
  const [capability, setCapability] = useState<string | null>(null);

  // `continuous` recognition delivers several final results in one session, so
  // finals accumulate rather than replace. Held in a ref as well because the
  // event listeners close over state that a re-render would otherwise stale.
  const finalRef = useRef("");
  /**
   * True from the moment the recogniser reports it started until the `end` or
   * `error` that concludes that recording. A ref rather than state because it
   * gates event handlers that can fire in the same tick as the render that
   * would have updated state — `phase` would still read as the previous value
   * there, and the guard would let exactly the event through that it exists to
   * block.
   */
  const recordingRef = useRef(false);
  /**
   * The last first-met date we held, so unticking the box and changing your
   * mind restores the date extraction worked out ("어제 처음 만났는데" →
   * 2026-08-26) rather than silently replacing it with today.
   */
  const lastFirstMetRef = useRef<string | null>(null);

  const runExtraction = useCallback(
    async (spoken: string) => {
      setPhase("extracting");
      setError(null);
      setTranscript(spoken);
      try {
        const result = await extract({
          text: spoken,
          today: localToday(),
          aboutName,
        });
        setDraft(result);
        setPhase("review");
      } catch (e) {
        // The action's ConvexError messages are written for this screen, so
        // they are shown as-is; anything else gets a plain line rather than a
        // stack trace.
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Andy couldn't make sense of that one. Try again.",
        );
        setPhase("idle");
      }
    },
    [extract, aboutName],
  );

  const scanCard = useCallback(
    async (from: "camera" | "library") => {
      setError(null);

      // Asked for at the moment of use, per feature, never on launch.
      const permission =
        from === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(
          from === "camera"
            ? "Andy needs the camera to photograph a card. You can turn it on in Settings."
            : "Andy needs access to your photos to read a card. You can turn it on in Settings.",
        );
        return;
      }

      // `allowsEditing` puts a crop step in front of the picker. It earns its
      // place twice: cropping to the card is what makes the text large and
      // straight enough to read well, and it drops the payload from a full
      // 12MP frame — whose base64 exceeds Convex's 1MB argument limit — to a
      // few hundred KB.
      const options = {
        base64: true,
        quality: 0.6,
        allowsEditing: true,
      } as const;
      const picked =
        from === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      // Backing out of the picker is a normal thing to do, not an error.
      if (picked.canceled) {
        return;
      }

      const imageBase64 = picked.assets?.[0]?.base64;
      if (!imageBase64) {
        setError("That photo didn't come through. Try again.");
        return;
      }

      setPhase("extracting");
      try {
        // `base64` is documented as the image's JPEG data regardless of the
        // file picked, so the media type is known rather than guessed from a
        // `mimeType` the picker may not supply.
        const result = await readCard({ imageBase64, mediaType: "image/jpeg" });
        setDraft(result.draft);
        setTranscript(result.cardText);
        setSource("business_card");
        setPhase("review");
      } catch (e) {
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Andy couldn't read that card. Try again.",
        );
        setPhase("idle");
      }
    },
    [readCard],
  );

  const chooseCardSource = useCallback(() => {
    Alert.alert("Scan a business card", undefined, [
      { text: "Take a photo", onPress: () => void scanCard("camera") },
      { text: "Choose from library", onPress: () => void scanCard("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [scanCard]);

  useSpeechRecognitionEvent("start", () => {
    recordingRef.current = true;
    setPhase("listening");
  });

  useSpeechRecognitionEvent("result", (event) => {
    const best = event.results[0]?.transcript ?? "";
    if (event.isFinal) {
      finalRef.current = `${finalRef.current}${finalRef.current ? " " : ""}${best}`.trim();
      setFinalText(finalRef.current);
      setInterim("");
    } else {
      setInterim(best);
    }
  });

  useSpeechRecognitionEvent("error", (event) => {
    // An error arriving after this recording already concluded would drop the
    // user from the review screen back to an empty capture screen mid-edit,
    // losing the corrections this step exists to collect.
    if (!recordingRef.current) {
      return;
    }
    recordingRef.current = false;
    // `no-speech` is what the recogniser reports when someone taps record and
    // then says nothing. That is a normal thing for a person to do, not a
    // failure worth showing them in red.
    if (event.error === "no-speech") {
      setPhase("idle");
      return;
    }
    setError(`${event.error}: ${event.message}`);
    setPhase("idle");
  });

  useSpeechRecognitionEvent("end", () => {
    // Exactly one `end` may start an extraction. A duplicate would re-run
    // Claude on the same transcript and replace the draft the user is part-way
    // through editing — silently discarding their corrections is the precise
    // failure this screen exists to prevent.
    if (!recordingRef.current) {
      return;
    }
    recordingRef.current = false;
    const spoken = finalRef.current.trim();
    if (spoken === "") {
      setPhase("idle");
      setInterim("");
      return;
    }
    setInterim("");
    void runExtraction(spoken);
  });

  const start = useCallback(async () => {
    setError(null);
    setPhase("starting");

    // Asked for here, at the moment of use, rather than on launch — CLAUDE.md
    // treats every permission as opt-in per feature.
    const permission =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError(
        "Andy needs the microphone and speech recognition to take a voice note. You can turn them on in Settings.",
      );
      setPhase("idle");
      return;
    }

    const onDeviceAvailable =
      ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();

    // Asking the device directly, because Apple does not document which
    // locales have an on-device model and the community answer for Korean is
    // contradictory. `installedLocales` is documented as Android-oriented, so
    // treat an empty one on iOS as "unknown", not as "not installed".
    let localeNote = "";
    try {
      const supported = await ExpoSpeechRecognitionModule.getSupportedLocales(
        {},
      );
      localeNote = ` · supported:${supported.locales.includes(locale)} installed:${
        supported.installedLocales.length === 0
          ? "unknown"
          : supported.installedLocales.includes(locale)
      }`;
    } catch (e) {
      localeNote = ` · locales unavailable (${e instanceof Error ? e.message : String(e)})`;
    }

    setCapability(
      `${locale} · on-device available: ${onDeviceAvailable} · requested: ${
        preferOnDevice && onDeviceAvailable
      }${localeNote}`,
    );

    finalRef.current = "";
    setFinalText("");
    setInterim("");
    setDraft(null);
    setTranscript("");

    ExpoSpeechRecognitionModule.start({
      lang: locale,
      // Without interim results a long note looks frozen while someone talks.
      interimResults: true,
      // A voice note is several sentences, not one command.
      continuous: true,
      // Inconsistent in practice: two ko-KR on-device runs of the same
      // sentence on 2026-08-27 produced no punctuation and then some. Left
      // enabled because it costs nothing and helps when it lands, but nothing
      // downstream may assume sentence boundaries exist.
      addsPunctuation: true,
      // Only ever requested when the device says it can do it, because asking
      // for it when it can't is the case that silently goes to the network.
      requiresOnDeviceRecognition: preferOnDevice && onDeviceAvailable,
    });
  }, [locale, preferOnDevice]);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const discard = useCallback(() => {
    finalRef.current = "";
    setFinalText("");
    setInterim("");
    setDraft(null);
    setTranscript("");
    setSource("voice");
    setError(null);
    setPhase("idle");
  }, []);

  const save = useCallback(async () => {
    if (draft === null) {
      return;
    }
    setPhase("saving");
    setError(null);
    try {
      const saved = await saveCapture({
        transcript,
        draft,
        source,
        // Only the answers still being asked for. A stale one — the name was
        // edited after it was chosen — would name somebody this note no longer
        // mentions, and the mutation rejects those rather than ignoring them.
        resolutions: ambiguous.flatMap((question) => {
          const profileId = resolutions[question.name];
          return profileId === undefined
            ? []
            : [{ name: question.name, profileId }];
        }),
      });

      // Never `push`: the capture is finished, and backing into a draft that
      // has already been written would invite saving it twice.
      //
      // When the note landed on the profile this capture was opened from, the
      // screen to show is already sitting underneath — so close this one
      // rather than stacking another copy of it. `replace` would leave the
      // original behind, and three notes in a row meant three profile screens
      // to back out of before reaching home. Convex queries are live, so the
      // profile revealed below already has the new note on it.
      if (
        profileId !== undefined &&
        saved.profileId === profileId &&
        router.canGoBack()
      ) {
        router.back();
        return;
      }

      // Otherwise the note went somewhere else — the user renamed the subject,
      // or capture started from home — and that profile is not on the stack to
      // return to.
      router.replace(`/profile/${saved.profileId}`);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Andy couldn't save that one. Try again.",
      );
      setPhase("review");
    }
  }, [draft, transcript, source, saveCapture, profileId, ambiguous, resolutions]);

  /** Edit one field of the draft's primary person. */
  const editPrimary = useCallback((patch: Partial<Draft["primary"]>) => {
    setDraft((current) =>
      current === null
        ? current
        : { ...current, primary: { ...current.primary, ...patch } },
    );
  }, []);

  /** Edit one field of one mentioned person. */
  const editMention = useCallback(
    (index: number, patch: Partial<Draft["mentions"][number]>) => {
      setDraft((current) =>
        current === null
          ? current
          : {
              ...current,
              mentions: current.mentions.map((m, i) =>
                i === index ? { ...m, ...patch } : m,
              ),
            },
      );
    },
    [],
  );

  const listening = phase === "listening";
  const busy = phase === "extracting" || phase === "saving";

  if ((phase === "review" || phase === "saving") && draft !== null) {
    const named = draft.primary.name.trim() !== "";
    // Unanswered questions block saving here as well as in the mutation. The
    // mutation refuses because it must; the screen refuses so that nobody is
    // shown an error for a question sitting on the same page.
    const canSave = named && allAnswered && phase === "review";

    return (
      <>
        <Stack.Screen options={{ title: "Check this over" }} />
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.reviewContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lead}>
            Andy heard this. Fix anything that isn&apos;t right before it&apos;s
            saved.
          </Text>

          <Field label="Name">
            <TextInput
              value={draft.primary.name}
              onChangeText={(name) => editPrimary({ name })}
              style={styles.input}
              placeholder="Who is this about?"
              placeholderTextColor={colors.line}
              accessibilityLabel="Name"
            />
            {/*
              What saving will do, said before it happens.

              A misheard name matches nobody and quietly becomes a new person —
              "조 킹" heard as "조깅" is a person the user never met. Nothing on
              this screen used to distinguish that from adding to somebody they
              already keep, so the only way to find out was to look for them
              afterwards. One line, and a wrong name is obvious while the field
              to fix it is still under the cursor.
            */}
            {primaryFate === undefined || primaryFate.length > 1 ? null : primaryFate.length === 0 ? (
              <Text style={styles.quiet}>
                New person — nobody by this name yet.
              </Text>
            ) : (
              <Text style={styles.quiet}>
                Adding to {primaryFate[0].name} · {describe(primaryFate[0])}
              </Text>
            )}
          </Field>

          <Field label="Who or what">
            <View style={styles.row}>
              {(["person", "animal"] as const).map((kind) => (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  accessibilityLabel={kind === "person" ? "Person" : "Animal"}
                  onPress={() => editPrimary({ entityType: kind })}
                  style={[
                    styles.choice,
                    draft.primary.entityType === kind && styles.choiceOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceLabel,
                      draft.primary.entityType === kind && styles.choiceLabelOn,
                    ]}
                  >
                    {kind === "person" ? "Person" : "Animal"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="How you know them">
            <TextInput
              value={draft.primary.relationshipContext ?? ""}
              onChangeText={(value) =>
                // Empty means "the note didn't say", which the save path spells
                // as null — the same distinction the extraction schema makes.
                editPrimary({
                  relationshipContext: value.trim() === "" ? null : value,
                })
              }
              style={styles.input}
              placeholder="client, friend, foster…"
              placeholderTextColor={colors.line}
              accessibilityLabel="How you know them"
            />
          </Field>

          <Field label="First meeting">
            {/*
              A checkbox, not a date field, because the judgement a person can
              actually make here is yes-or-no. Whether "오늘 지수 만났는데"
              describes a first meeting is not decidable from the sentence, and
              extraction fills it about half the time — so this is the tick a
              person confirms or clears, and the date only matters once they
              have said yes.
            */}
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="This was the first time we met"
              accessibilityState={{ checked: draft.primary.firstMetDate !== null }}
              onPress={() => {
                if (draft.primary.firstMetDate !== null) {
                  lastFirstMetRef.current = draft.primary.firstMetDate;
                  editPrimary({ firstMetDate: null });
                } else {
                  editPrimary({
                    firstMetDate: lastFirstMetRef.current ?? localToday(),
                  });
                }
              }}
              style={styles.checkRow}
            >
              <View
                style={[
                  styles.checkBox,
                  draft.primary.firstMetDate !== null && styles.checkBoxOn,
                ]}
              >
                {draft.primary.firstMetDate !== null ? (
                  <Text style={styles.checkMark}>✓</Text>
                ) : null}
              </View>
              <Text style={styles.checkLabel}>
                This was the first time we met
              </Text>
            </Pressable>

            {draft.primary.firstMetDate !== null ? (
              <TextInput
                value={draft.primary.firstMetDate}
                onChangeText={(value) =>
                  editPrimary({
                    firstMetDate: value.trim() === "" ? null : value,
                  })
                }
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.line}
                accessibilityLabel="First met date"
              />
            ) : null}
          </Field>

          <Field label="What to remember">
            {draft.primary.keyFacts.length === 0 ? (
              <Text style={styles.quiet}>Nothing pulled out of this one.</Text>
            ) : (
              draft.primary.keyFacts.map((fact, index) => (
                <View key={index} style={styles.factRow}>
                  <TextInput
                    value={fact}
                    onChangeText={(next) =>
                      editPrimary({
                        keyFacts: draft.primary.keyFacts.map((f, i) =>
                          i === index ? next : f,
                        ),
                      })
                    }
                    style={[styles.input, styles.factInput]}
                    multiline
                    accessibilityLabel={`Fact ${index + 1}`}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove fact ${index + 1}`}
                    onPress={() =>
                      editPrimary({
                        keyFacts: draft.primary.keyFacts.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                    style={styles.remove}
                  >
                    <Text style={styles.removeLabel}>×</Text>
                  </Pressable>
                </View>
              ))
            )}
          </Field>

          {draft.primary.tags.length > 0 ? (
            <Field label="Tags">
              {draft.primary.tags.map((tag, index) => (
                <View key={index} style={styles.factRow}>
                  <TextInput
                    value={tag}
                    onChangeText={(next) =>
                      editPrimary({
                        tags: draft.primary.tags.map((t, i) =>
                          i === index ? next : t,
                        ),
                      })
                    }
                    style={[styles.input, styles.factInput]}
                    accessibilityLabel={`Tag ${index + 1}`}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove tag ${index + 1}`}
                    onPress={() =>
                      editPrimary({
                        tags: draft.primary.tags.filter((_, i) => i !== index),
                      })
                    }
                    style={styles.remove}
                  >
                    <Text style={styles.removeLabel}>×</Text>
                  </Pressable>
                </View>
              ))}
            </Field>
          ) : null}

          {draft.mentions.length > 0 ? (
            <Field label="Also came up">
              {draft.mentions.map((mention, index) => (
                <View key={index} style={styles.mentionBlock}>
                  <View style={styles.factRow}>
                    <TextInput
                      value={mention.name}
                      onChangeText={(name) => editMention(index, { name })}
                      style={[styles.input, styles.factInput]}
                      accessibilityLabel={`Mentioned name ${index + 1}`}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove mention ${index + 1}`}
                      onPress={() =>
                        setDraft({
                          ...draft,
                          mentions: draft.mentions.filter((_, i) => i !== index),
                        })
                      }
                      style={styles.remove}
                    >
                      <Text style={styles.removeLabel}>×</Text>
                    </Pressable>
                  </View>
                  {/*
                    Editable, and it did not start that way.
                    
                    The argument for locking it was that a quote's value is
                    being what was actually said rather than a summary of it.
                    That confused two different things: it is copied verbatim
                    from the *transcript*, and the transcript is exactly what
                    speech recognition gets wrong — "주말마다 어머니를 뵌다"
                    came back as "어머니를 팬다". Locking the field meant the
                    user could watch a mistranscription being saved to two
                    people's profiles and not touch it, which is the one thing
                    this whole screen exists to prevent.
                    
                    Always rendered, even when empty: Claude returns an empty
                    quote when it cannot copy a span exactly, and that has
                    already happened on real data. A blank field can be filled
                    in; absent markup cannot.
                  */}
                  <TextInput
                    value={mention.quote}
                    onChangeText={(quote) => editMention(index, { quote })}
                    style={[styles.input, styles.mentionQuoteInput]}
                    multiline
                    placeholder="What the note says about them"
                    placeholderTextColor={colors.line}
                    accessibilityLabel={`Mentioned quote ${index + 1}`}
                  />
                </View>
              ))}
            </Field>
          ) : null}

          <Field
            label={source === "business_card" ? "What the card says" : "What you said"}
          >
            <Text style={styles.quiet}>
              Correcting this fixes the note itself. It does not re-read the
              facts above — those are yours to edit.
            </Text>
            <TextInput
              value={transcript}
              onChangeText={setTranscript}
              style={[styles.input, styles.transcriptInput]}
              multiline
              accessibilityLabel={
                source === "business_card" ? "What the card says" : "What you said"
              }
            />
          </Field>

          {/*
            One question per name that more than one person answers to.
            Above the save button rather than beside the name it is about: it
            is not a correction to the draft, it is the thing standing between
            this note and being saved, and it belongs where that is obvious.
          */}
          {ambiguous.map((question) => (
            <Field
              key={question.name}
              label={`Which ${question.name}?`}
            >
              <Text style={styles.quiet}>
                You keep more than one. This note goes to whichever you pick.
              </Text>
              {question.candidates.map((candidate) => {
                const picked = resolutions[question.name] === candidate.profileId;
                return (
                  <Pressable
                    key={candidate.profileId}
                    accessibilityRole="button"
                    accessibilityLabel={`${candidate.name}, ${describe(candidate)}`}
                    accessibilityState={{ selected: picked }}
                    onPress={() =>
                      setResolutions((current) => ({
                        ...current,
                        [question.name]: candidate.profileId,
                      }))
                    }
                    style={[styles.candidate, picked && styles.candidateOn]}
                  >
                    <Text
                      style={[
                        styles.candidateName,
                        picked && styles.candidateNameOn,
                      ]}
                    >
                      {candidate.name}
                    </Text>
                    {/* Identical names are not a choice. What separates them is
                        how you know them and what is already recorded. */}
                    <Text
                      style={[
                        styles.candidateMeta,
                        picked && styles.candidateNameOn,
                      ]}
                    >
                      {describe(candidate)}
                    </Text>
                  </Pressable>
                );
              })}
            </Field>
          ))}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save note"
            onPress={save}
            disabled={!canSave}
            style={[styles.primaryButton, !canSave && styles.disabled]}
          >
            <Text style={styles.primaryLabel}>
              {phase === "saving" ? "Saving…" : "Save note"}
            </Text>
          </Pressable>
          {named ? null : (
            <Text style={styles.quiet}>
              Add a name first — Andy couldn&apos;t tell who this is about.
            </Text>
          )}
          {named && !allAnswered ? (
            <Text style={styles.quiet}>
              Say which person each name above means, and this can be saved.
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Discard and start over"
            onPress={discard}
            disabled={phase === "saving"}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryLabel}>Discard and start over</Text>
          </Pressable>
        </ScrollView>
      </>
    );
  }

  const body = finalText || interim;

  return (
    <>
      <Stack.Screen options={{ title: "New note" }} />
      <View style={styles.container}>
        <ScrollView
          style={styles.transcriptArea}
          // Centred while the screen is only holding a status line, top-aligned
          // once there are words to read: a sentence pinned to the top of an
          // otherwise empty screen reads as a fragment of a page that failed to
          // load, which is exactly the wrong impression for "we can't reach the
          // server" to give.
          contentContainerStyle={[
            styles.transcriptContent,
            body ? null : styles.transcriptContentEmpty,
          ]}
        >
          {body ? (
            <Text style={styles.transcript}>
              {finalText}
              {interim ? (
                <Text style={styles.interim}>
                  {finalText ? " " : ""}
                  {interim}
                </Text>
              ) : null}
            </Text>
          ) : (
            <Text style={styles.empty}>
              {listening
                ? "Listening — say what's new."
                : scopeMissing
                  ? "Andy doesn't have anyone by that link."
                  : scopeLoading
                    ? "Finding out who this is about…"
                    : aboutName !== undefined
                      ? `Tap record. This note goes to ${aboutName}, whoever else comes up.`
                      : "Tap record and say what you want to remember."}
            </Text>
          )}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? "Stop recording" : "Start recording"}
          onPress={listening ? stop : start}
          // Not recordable until the subject is known. Starting first and
          // hoping the name arrives before the user stops talking would fail
          // exactly when the network is slow, and fail silently — the note
          // would be extracted as if it had come from home.
          disabled={phase === "starting" || busy || scopeLoading || scopeMissing}
          style={[
            styles.primaryButton,
            listening && styles.recording,
            (busy || scopeLoading || scopeMissing) && styles.disabled,
          ]}
        >
          <Text style={styles.primaryLabel}>
            {phase === "extracting"
              ? "Reading it back…"
              : phase === "starting"
                ? "Starting…"
                : listening
                  ? "Stop"
                  : "Record"}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan a business card"
          onPress={chooseCardSource}
          disabled={listening || busy || phase === "starting"}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryLabel}>Scan a business card</Text>
        </Pressable>

        {/*
          Measurement instrument, not product. PROJECT_SCOPE.md requires Korean
          accuracy to be measured on Day 2, and that means being able to switch
          locale and on-device mode without a rebuild between attempts. __DEV__
          keeps every line of it out of a release build.
        */}
        {__DEV__ ? (
          <View style={styles.dev}>
            <Text style={styles.devText}>{capability ?? "not started yet"}</Text>
            <Text style={styles.devText}>
              scoped to: {profileId ?? "nobody yet"}
            </Text>
            <View style={styles.devRow}>
              <Pressable
                onPress={() =>
                  setLocale((l) => (l === "ko-KR" ? "en-US" : "ko-KR"))
                }
                style={styles.devButton}
              >
                <Text style={styles.devText}>lang: {locale}</Text>
              </Pressable>
              <Pressable
                onPress={() => setPreferOnDevice((v) => !v)}
                style={styles.devButton}
              >
                <Text style={styles.devText}>
                  on-device: {preferOnDevice ? "prefer" : "off"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 24, gap: 16 },
  reviewContent: { paddingBottom: 48, gap: 20 },
  lead: { color: colors.ink, fontSize: 15, opacity: 0.75, lineHeight: 22 },

  transcriptArea: { flex: 1 },
  transcriptContent: { paddingVertical: 8 },
  transcriptContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  transcript: { color: colors.ink, fontSize: 18, lineHeight: 27 },
  /** The unfinalised tail, dimmed so it reads as "still deciding". */
  interim: { color: colors.ink, opacity: 0.45 },
  empty: {
    color: colors.ink,
    fontSize: 15,
    opacity: 0.6,
    lineHeight: 22,
    textAlign: "center",
  },

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
  factRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  factInput: { flex: 1 },
  quiet: { color: colors.ink, fontSize: 14, opacity: 0.55, lineHeight: 21 },

  row: { flexDirection: "row", gap: 8 },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  choiceOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  choiceLabel: { color: colors.ink, fontSize: 14 },
  choiceLabelOn: { color: colors.paper },

  candidate: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    gap: 3,
  },
  candidateOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  candidateName: { color: colors.ink, fontSize: 16 },
  candidateMeta: { color: colors.ink, fontSize: 13, opacity: 0.6 },
  candidateNameOn: { color: colors.paper, opacity: 1 },

  mentionBlock: { gap: 4, paddingBottom: 8 },
  // Smaller than the name above it, but carrying the same bottom rule as every
  // other field on this screen: the left rule it used to have was the mark of a
  // quotation nobody could touch, and it would now be telling the user the
  // opposite of the truth.
  mentionQuoteInput: { fontSize: 14, lineHeight: 21 },
  transcriptInput: { fontSize: 15, lineHeight: 22 },

  checkRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  checkMark: { color: colors.paper, fontSize: 14, fontWeight: "600" },
  checkLabel: { color: colors.ink, fontSize: 15 },

  remove: { paddingHorizontal: 10, paddingVertical: 8 },
  removeLabel: { color: colors.ink, fontSize: 18, opacity: 0.5 },

  error: { color: colors.alert, fontSize: 14 },

  primaryButton: {
    backgroundColor: colors.moss,
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: "center",
  },
  recording: { backgroundColor: colors.alert },
  disabled: { opacity: 0.5 },
  primaryLabel: { color: colors.paper, fontSize: 17, fontWeight: "600" },
  secondaryButton: { paddingVertical: 12, alignItems: "center" },
  secondaryLabel: { color: colors.ink, fontSize: 15, opacity: 0.7 },

  dev: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 12,
    gap: 8,
  },
  devRow: { flexDirection: "row", gap: 8 },
  devButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  devText: { color: colors.ink, fontSize: 12, opacity: 0.6 },
});
