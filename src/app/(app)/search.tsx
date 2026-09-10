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
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = question.trim() !== "" && !busy;
  // Whether anything below is actually marked. The answer's source line claims
  // there are marks, and `usedNotes: []` is a designed outcome rather than an
  // edge case — the prompt tells the model to cite nothing when it drew on
  // nothing, and the score floor is deliberately low enough that near-misses
  // reach it. So "retrieved something, cited none" is a common shape, and the
  // label must not point at marks that are not there.
  const cited = results?.some((result) => result.used) ?? false;

  async function ask() {
    // Submit only. An embedding is a paid call on somebody else's meter, so a
    // `useAction` wired to `onChangeText` would turn one question into ten of
    // them — the realistic way this feature becomes expensive.
    if (!ready) return;

    setBusy(true);
    setError(null);
    // Not load-bearing today — `busy` swaps the whole list out, so no stale
    // answer is on screen while the next one is in flight. It costs nothing and
    // stops that from being the only thing standing in the way.
    setAnswer("");
    try {
      const response = await recall({ query: question.trim() });
      setAnswer(response.answer);
      setResults(response.results);
    } catch (thrown) {
      // The server's own words when it wrote them for a person to read; a plain
      // line otherwise. Never the raw error — it can carry the question back.
      setError(
        thrown instanceof ConvexError
          ? String(thrown.data)
          : "Andy couldn't reach that just now. Try again.",
      );
      setResults(null);
      setAnswer("");
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
            ListHeaderComponent={
              answer.trim() === "" ? null : (
                <View style={styles.answer} testID="answer">
                  <Text style={styles.answerText}>{answer}</Text>
                  {/*
                    Only when something is actually marked. Named rather than
                    implied, because an answer written over notes is only as good
                    as the notes — day 2 measured extraction laundering a
                    mistranscription into a confident false fact, so what the
                    answer rests on has to be reachable rather than summarised.
                    Which is exactly why claiming marks that are not there would
                    be worse than saying nothing.
                  */}
                  {cited && (
                    <Text style={styles.label}>From the marked notes below</Text>
                  )}
                </View>
              )
            }
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
          // First, not last. Read at the end of the line at 12px it was the
          // least prominent text on the card, doing the job the answer's label
          // calls "marked". At the front the marks line up down the left edge
          // and the list can be scanned for them.
          //
          // The unmarked notes are still shown: "here is everything near your
          // question" is honest, and hiding them would let a wrong answer look
          // like the only thing there was.
          result.used ? "used in the answer" : null,
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
          <Text style={styles.label}>Also came up</Text>
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

  // Plain, like everything else on this screen. `STYLE.md` keeps `brass` for the
  // Briefing card and names search results as a place that stays disciplined —
  // an answer in the signature colour would spend the one risk twice.
  // The most important text on the screen, so it gets weight from size and
  // space rather than colour: `STYLE.md` keeps `brass` for the Briefing card and
  // names search results as a screen that stays plain. At 17px under a hairline
  // it read as "card zero" — smaller than the profile names beneath it.
  answer: {
    gap: 8,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  answerText: { color: colors.ink, fontSize: 19, lineHeight: 28 },

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
  // screen rather than restating it differently. One definition, both uses:
  // written twice in one StyleSheet they were byte-identical.
  label: {
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
