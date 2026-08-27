import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { colors } from "@/constants/theme";

/**
 * Voice capture — speech in, transcript out.
 *
 * This screen deliberately stops at the transcript. Extraction (the Convex
 * action) and saving are separate slices, so that the transcription decision
 * stays swappable: if on-device recognition turns out not to be good enough for
 * Korean, only this file changes.
 *
 * Recognition runs through Apple's SFSpeechRecognizer via expo-speech-recognition.
 * Note the library cannot *guarantee* on-device processing — when a locale has
 * no on-device model, `requiresOnDeviceRecognition` silently falls back to
 * Apple's servers rather than erroring (jamsch/expo-speech-recognition#169).
 * That is why the microphone and speech permission strings in app.json promise
 * transcription, not privacy: we can't honestly promise what we can't enforce.
 */

/**
 * Korean is the default because it is the case this app has to get right and
 * the one PROJECT_SCOPE.md flags as a risk; English recognition is the easy
 * case. Reading the device's preferred locale instead would be the real answer
 * and needs a locale picker anyway — deferred, deliberately, not forgotten.
 */
const DEFAULT_LOCALE = "ko-KR";

type Status = "idle" | "starting" | "listening";

export default function CaptureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [status, setStatus] = useState<Status>("idle");
  /** Finalised text, accumulated across the utterances of one recording. */
  const [finalText, setFinalText] = useState("");
  /** The in-flight guess, replaced on every event until it finalises. */
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [locale, setLocale] = useState(DEFAULT_LOCALE);
  const [preferOnDevice, setPreferOnDevice] = useState(true);
  /** What the device said it could do, filled in on first start. */
  const [capability, setCapability] = useState<string | null>(null);

  // `continuous` recognition delivers several final results in one session, so
  // finals accumulate rather than replace. Held in a ref as well because the
  // event listeners close over state that a re-render would otherwise stale.
  const finalRef = useRef("");

  useSpeechRecognitionEvent("start", () => {
    setStatus("listening");
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
    // `no-speech` is what the recogniser reports when someone taps record and
    // then says nothing. That is a normal thing for a person to do, not a
    // failure worth showing them in red.
    if (event.error === "no-speech") {
      setStatus("idle");
      return;
    }
    setError(`${event.error}: ${event.message}`);
    setStatus("idle");
  });

  useSpeechRecognitionEvent("end", () => {
    setStatus("idle");
    setInterim("");
  });

  const start = useCallback(async () => {
    setError(null);
    setStatus("starting");

    // Asked for here, at the moment of use, rather than on launch — CLAUDE.md
    // treats every permission as opt-in per feature.
    const permission =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError(
        "Andy needs the microphone and speech recognition to take a voice note. You can turn them on in Settings.",
      );
      setStatus("idle");
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

    ExpoSpeechRecognitionModule.start({
      lang: locale,
      // Without interim results a long note looks frozen while someone talks.
      interimResults: true,
      // A voice note is several sentences, not one command.
      continuous: true,
      // Asked for, but measured as having no effect: a ko-KR on-device
      // transcript on 2026-08-27 came back with no punctuation at all. Left
      // enabled because it costs nothing and may apply to other locales, but
      // nothing downstream may assume sentence boundaries exist.
      addsPunctuation: true,
      // Only ever requested when the device says it can do it, because asking
      // for it when it can't is the case that silently goes to the network.
      requiresOnDeviceRecognition: preferOnDevice && onDeviceAvailable,
    });
  }, [locale, preferOnDevice]);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  const listening = status === "listening";
  const body = finalText || interim;

  return (
    <>
      <Stack.Screen options={{ title: "New note" }} />
      <View style={styles.container}>
        <ScrollView
          style={styles.transcriptArea}
          contentContainerStyle={styles.transcriptContent}
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
                : "Tap record and say what you want to remember."}
            </Text>
          )}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? "Stop recording" : "Start recording"}
          onPress={listening ? stop : start}
          disabled={status === "starting"}
          style={[styles.record, listening && styles.recording]}
        >
          <Text style={styles.recordLabel}>
            {status === "starting"
              ? "Starting…"
              : listening
                ? "Stop"
                : "Record"}
          </Text>
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
            <Text style={styles.devText}>id: {id}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 24, gap: 16 },
  transcriptArea: { flex: 1 },
  transcriptContent: { paddingVertical: 8 },
  transcript: { color: colors.ink, fontSize: 18, lineHeight: 27 },
  /** The unfinalised tail, dimmed so it reads as "still deciding". */
  interim: { color: colors.ink, opacity: 0.45 },
  empty: { color: colors.ink, fontSize: 15, opacity: 0.6 },
  error: { color: colors.alert, fontSize: 14 },
  record: {
    backgroundColor: colors.moss,
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: "center",
  },
  recording: { backgroundColor: colors.alert },
  recordLabel: { color: colors.paper, fontSize: 17, fontWeight: "600" },
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
