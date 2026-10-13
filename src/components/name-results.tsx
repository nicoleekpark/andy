import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { colors, fonts, space, textOpacity, textSize } from "@/constants/theme";

export type NameResultsData = FunctionReturnType<typeof api.people.search>;

/**
 * People found by name or by a word, and the notes somebody else wrote where
 * the name came up (`useNameSearch`). Shared by Ask and home's search field so
 * a person found either way looks the same and opens the same place.
 */
export function NameResults({ results }: { results: NameResultsData | undefined }) {
  return (
    <>
        {results !== undefined && results.people.length > 0 ? (
          <View testID="people-results">
            <Text style={styles.sectionLabel}>People</Text>
            {results.people.map((person) => (
              <Pressable
                key={person.profileId}
                accessibilityRole="button"
                accessibilityLabel={`Open ${person.name}`}
                onPress={() => router.push(`/profile/${person.profileId}`)}
                style={styles.personRow}
              >
                <Text style={styles.personName}>{person.name}</Text>
                <Text style={styles.personMeta}>
                  {/*
                    The name that matched, when it is not the one they are
                    filed under. A row reading "Marcus" after typing "Marc"
                    explains itself; one that does not makes you wonder why he
                    is in the list.
                  */}
                  {person.matchedName !== person.name
                    ? `${person.matchedName} · `
                    : ""}
                  {person.relationshipContext !== undefined
                    ? `${person.relationshipContext} · `
                    : ""}
                  {/*
                    A person with no notes of their own is a different thing
                    from a person with none *yet*, and the row has to say
                    which. Andy invents somebody the moment a note says their
                    name, so this is also where a mistake shows — "Park's
                    housewarming" heard as a person called "Parks" looked
                    exactly like a real person until this line existed.
                  */}
                  {person.noteCount > 0
                    ? person.noteCount === 1
                      ? "1 note"
                      : `${person.noteCount} notes`
                    : person.mentionCount > 0
                      ? person.mentionCount === 1
                        ? "only mentioned, in 1 note"
                        : `only mentioned, in ${person.mentionCount} notes`
                      : "nothing remembered yet"}
                </Text>
                {person.matchedIn !== undefined ? (
                  // Found by a word, not a name: the line it is in, so the row
                  // says why this person is here.
                  <Text testID={`profile-result-match-${person.profileId}`} style={styles.personMeta}>
                    &ldquo;{person.matchedIn}&rdquo;
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {results !== undefined && results.mentions.length > 0 ? (
          <View testID="mention-results">
            <Text style={styles.sectionLabel}>Came up in</Text>
            {results.mentions.map((mention) => (
              <Pressable
                key={`${mention.noteId}-${mention.name}`}
                accessibilityRole="button"
                accessibilityLabel={`Open the note about ${mention.aboutName}`}
                onPress={() => router.push(`/note/${mention.noteId}`)}
                style={styles.personRow}
              >
                <Text style={styles.personName}>{mention.aboutName}</Text>
                <Text style={styles.personMeta}>
                  &ldquo;{mention.quote}&rdquo;
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: textSize.xs,
    opacity: textOpacity.quiet,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: space.xs,
    marginHorizontal: space.xl,
  },
  personRow: {
    paddingVertical: 10,
    paddingHorizontal: space.xl,
    gap: 2,
  },
  personName: { color: colors.moss, fontSize: textSize.lg },
  personMeta: {
    color: colors.ink,
    fontFamily: fonts.utility,
    fontSize: textSize.xs,
    opacity: textOpacity.quiet,
  },
});
