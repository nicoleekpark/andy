import { Stack, router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { colors } from "@/constants/theme";

/**
 * Home: the people you keep, and the way in to everything else.
 *
 * Until now every screen was reachable only by deep link, which made the app
 * unusable without a terminal. This is the hub — profiles out to the timeline,
 * the record button out to capture, the gear out to settings (and the only
 * sign-out button in the app).
 *
 * No search box yet. PROJECT_SCOPE.md puts one here, but search itself is Day 4
 * — a box that finds nothing is worse than no box, and at this list length
 * scanning is faster anyway.
 */
export default function HomeScreen() {
  const people = useQuery(api.profiles.recent);

  return (
    <>
      <Stack.Screen
        options={{
          title: "Andy",
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Settings"
              onPress={() => router.push("/settings")}
              hitSlop={12}
            >
              <Text style={styles.headerAction}>Settings</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <FlatList
          data={people ?? []}
          keyExtractor={(item) => item.profile._id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            // Centred in the space the list would have filled. `list` already
            // grows to that space, so the wrapper only has to say where in it.
            <View style={styles.emptyState}>
              {people === undefined ? (
                <Text style={styles.quiet}>Loading…</Text>
              ) : (
                <Text style={styles.quiet}>
                  No one yet — tap record to remember your first person.
                </Text>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.profile.name}
              onPress={() => router.push(`/profile/${item.profile._id}`)}
              style={styles.row}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{item.profile.name}</Text>
                <Text style={styles.rowMeta}>
                  {[
                    item.profile.relationshipContext,
                    `${item.noteCount} ${item.noteCount === 1 ? "note" : "notes"}`,
                    new Date(item.lastNoteAt).toLocaleDateString("en-CA"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            </Pressable>
          )}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record"
          onPress={() => router.push("/capture")}
          style={styles.record}
        >
          <Text style={styles.recordLabel}>Record</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, padding: 24, gap: 16 },
  headerAction: { color: colors.ink, fontSize: 15 },

  list: { gap: 4, paddingBottom: 8, flexGrow: 1 },
  row: { paddingVertical: 14 },
  rowText: { gap: 3 },
  rowName: { color: colors.ink, fontSize: 18 },
  rowMeta: { color: colors.ink, fontSize: 13, opacity: 0.55 },

  emptyState: { flex: 1, justifyContent: "center", alignItems: "center" },
  quiet: {
    color: colors.ink,
    fontSize: 15,
    opacity: 0.6,
    lineHeight: 22,
    textAlign: "center",
  },

  record: {
    backgroundColor: colors.moss,
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: "center",
  },
  recordLabel: { color: colors.paper, fontSize: 17, fontWeight: "600" },
});
