import { Stack, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import { colors, fonts } from "@/constants/theme";

/**
 * Ask Andy — recall across every note, not only the ones filed under a name.
 *
 * This replaces the placeholder that has stood here since day 1. It is not a
 * `useQuery` screen and cannot be: `ctx.vectorSearch` runs only in an action, so
 * this asks a question once rather than subscribing to a view. That turns out to
 * be the honest shape anyway — results quietly rearranging under someone who is
 * reading them would be worse than stale ones.
 *
 * **A result is a note, headed by the person it is about.** That ordering is the
 * point rather than a layout preference: the thing that matched is a note, and
 * the person is how you get somewhere from it. Anyone else who came up in that
 * note is listed underneath and is tappable too — which is the only way somebody
 * who exists solely inside another person's note is reachable at all, and the
 * reason `PROJECT_SCOPE.md` calls cross-profile mention search a Must-have.
 *
 * No `brass` here. `STYLE.md` reserves the signature colour for the Briefing
 * card and names search results specifically as a screen that stays plain.
 */

type Results = FunctionReturnType<typeof api.search.recall>["results"];

export default function SearchScreen() {
  const recall = useAction(api.search.recall);

  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = question.trim() !== "" && !busy;

  async function ask() {
    // Submit only. An embedding is a paid call on somebody else's meter, so a
    // `useAction` wired to `onChangeText` would turn one question into ten of
    // them — the realistic way this feature becomes expensive.
    if (!ready) return;

    setBusy(true);
    setError(null);
    try {
      const answer = await recall({ query: question.trim() });
      setResults(answer.results);
    } catch (thrown) {
      // The server's own words when it wrote them for a person to read; a plain
      // line otherwise. Never the raw error — it can carry the question back.
      setError(
        thrown instanceof ConvexError
          ? String(thrown.data)
          : "Andy couldn't reach that just now. Try again.",
      );
      setResults(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Ask Andy" }} />
      <View style={styles.container}>
        <View style={styles.askRow}>
          <TextInput
            accessibilityLabel="Ask Andy"
            style={styles.input}
            // Short enough to survive the Ask button taking half the row.
            // The longer explanation lives in the empty state below, where it has
            // the full width and nothing to compete with.
            placeholder="Who are you thinking of?"
            placeholderTextColor={colors.line}
            value={question}
            onChangeText={setQuestion}
            onSubmitEditing={ask}
            returnKeyType="search"
            autoCapitalize="none"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ask"
            accessibilityState={{ disabled: !ready }}
            onPress={ask}
            disabled={!ready}
            style={[styles.ask, !ready && styles.askDisabled]}
          >
            <Text style={styles.askLabel}>Ask</Text>
          </Pressable>
        </View>

        {error !== null && <Text style={styles.error}>{error}</Text>}

        {busy ? (
          <View style={styles.centred}>
            <ActivityIndicator
              color={colors.moss}
              // Labelled so it can be found — an unlabelled spinner is a branch
              // no test can reach, which is the same as an untested one.
              accessibilityLabel="Searching"
            />
          </View>
        ) : results === null ? (
          // Only when nothing has happened yet. Rendering this *under* an error
          // would have the screen apologise and then act as though the question
          // was never asked.
          error === null ? (
            <View style={styles.centred}>
              <Text style={styles.quiet}>
                Ask in your own words. Andy reads everything you have saved —
                including people who only came up inside someone else&apos;s
                note.
              </Text>
            </View>
          ) : null
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.noteId}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.centred}>
                <Text style={styles.quiet}>
                  Nothing saved about that yet — try other words, or record it.
                </Text>
              </View>
            }
            renderItem={({ item }) => <ResultCard result={item} />}
          />
        )}
      </View>
    </>
  );
}

function ResultCard({ result }: { result: Results[number] }) {
  // The endorsed facts when there are any, the transcript when there are not —
  // the same precedence the embedding uses, so what is shown is what matched.
  const facts = result.keyFacts ?? [];

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={result.profile.name}
        onPress={() => router.push(`/profile/${result.profile.profileId}`)}
      >
        <Text style={styles.cardName}>{result.profile.name}</Text>
      </Pressable>
      <Text style={styles.cardMeta}>
        {[
          result.profile.relationshipContext,
          new Date(result.createdAt).toLocaleDateString("en-CA"),
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {facts.length > 0 ? (
        // One per line, as on the profile screen. Joined with separators they
        // read as a run-on sentence the moment there are more than two.
        facts.map((fact, index) => (
          <Text key={`${result.noteId}-fact-${index}`} style={styles.cardBody}>
            {fact}
          </Text>
        ))
      ) : (
        // Bounded, because one long voice note would otherwise push every other
        // result off the screen the first time this is used for real.
        <Text style={styles.cardBody} numberOfLines={4}>
          {result.text}
        </Text>
      )}

      {result.mentions.length > 0 && (
        <View style={styles.mentions}>
          {/* Same words as the profile screen. One concept, one name. */}
          <Text style={styles.mentionsLabel}>Also came up</Text>
          <View style={styles.mentionRow}>
            {/*
              One guard, not two — the element type itself. A `Pressable` with
              `disabled` *plus* a null check inside `onPress` means either can be
              deleted with every test still green, which is precisely how day 3
              shipped a deleted person's name that was still tappable. This is
              the shape `profile/[id]/index.tsx` already settled on, and it also
              stops VoiceOver announcing a name that was never a control as a
              dimmed button.

              The name itself stays either way: deleting somebody must not
              rewrite the notes of everyone who mentioned them.
            */}
            {result.mentions.map((mention, index) =>
              mention.profileId !== null ? (
                <Pressable
                  key={`${result.noteId}-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={mention.name}
                  onPress={() =>
                    router.push(`/profile/${mention.profileId}`)
                  }
                >
                  <Text style={[styles.mention, styles.mentionLive]}>
                    {mention.name}
                  </Text>
                </Pressable>
              ) : (
                <Text
                  key={`${result.noteId}-${index}`}
                  style={[styles.mention, styles.mentionGone]}
                >
                  {mention.name}
                </Text>
              ),
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 24, gap: 16 },

  askRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ask: {
    backgroundColor: colors.moss,
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  askDisabled: { opacity: 0.5 },
  askLabel: { color: colors.paper, fontSize: 16, fontWeight: "600" },

  error: { color: colors.alert, fontSize: 14, lineHeight: 20 },

  list: { paddingBottom: 8, flexGrow: 1 },
  // A hairline instead of a gap: two notes about the same person head two cards
  // with the same name, and with only whitespace between them they read as one
  // card once the bodies wrap.
  card: {
    gap: 5,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  cardName: { color: colors.ink, fontSize: 18, fontFamily: fonts.display },
  cardMeta: {
    color: colors.ink,
    fontSize: 12,
    opacity: 0.55,
    fontFamily: fonts.utility,
  },
  cardBody: { color: colors.ink, fontSize: 15, lineHeight: 22, opacity: 0.85 },

  mentions: { gap: 4, marginTop: 3 },
  // A section header, so `fonts.display` — `STYLE.md` puts utility on dates,
  // tags and counts, not on headings. Matches `sectionLabel` on the profile
  // screen rather than restating it differently.
  mentionsLabel: {
    color: colors.ink,
    fontSize: 11,
    opacity: 0.45,
    fontFamily: fonts.display,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  mentionRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  mention: { fontSize: 14 },
  mentionLive: { color: colors.moss },
  mentionGone: { color: colors.ink, opacity: 0.75 },

  centred: { flex: 1, justifyContent: "center", alignItems: "center" },
  quiet: {
    color: colors.ink,
    fontSize: 15,
    opacity: 0.6,
    lineHeight: 22,
    textAlign: "center",
  },
});
