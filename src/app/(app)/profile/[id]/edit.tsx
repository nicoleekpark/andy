import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { colors } from "@/constants/theme";

/**
 * Correcting the person, as opposed to correcting a note about them.
 *
 * The gap this closes showed the first time a business card came back as
 * `JOE KING`: that string went to `profiles.name`, which is what every screen
 * displays *and* what `notes.saveCapture` matches the next capture against, and
 * nothing in the app could touch it. PROJECT_SCOPE.md has listed manual profile
 * edit under Must Have since day one.
 *
 * The same shape as the note screen next door, deliberately: the working copy
 * is derived at render rather than copied into state by an effect, and every
 * keystroke writes the whole copy. See `note/[id].tsx` for why — the reasoning
 * is identical and the bug it avoids is the same one.
 */
export default function EditProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const result = useQuery(api.profiles.withNotes, { profileId: id });
  const updateProfile = useMutation(api.profiles.updateProfile);

  type Draft = {
    name: string;
    entityType: "person" | "animal";
    relationshipContext: string;
    firstMetDate: string;
    tags: string[];
  };

  const [edits, setEdits] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved: Draft | null =
    result === undefined || result === null
      ? null
      : {
          name: result.profile.name,
          entityType: result.profile.entityType,
          // The table stores "not known" as an absent field; a form has to show
          // it as an empty box, and `updateProfile` converts back on the way in.
          relationshipContext: result.profile.relationshipContext ?? "",
          firstMetDate: result.profile.firstMetDate ?? "",
          tags: result.profile.tags,
        };
  const working = edits ?? saved;

  function edit(patch: Partial<Draft>) {
    if (working === null) {
      return;
    }
    setEdits({ ...working, ...patch });
  }

  async function save() {
    if (working === null) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ profileId: id, ...working });

      // Normally this was opened from the profile it edits, so closing it puts
      // the corrected person back in view — Convex queries are live, so what is
      // underneath already shows the change. Opened straight from a link there
      // is nothing beneath, and dispatching a back that cannot happen throws.
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/profile/${id}`);
      }
    } catch (e) {
      // The mutation's ConvexError messages name the clashing person and the
      // date format, so they are shown as they are.
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Andy couldn't save that change. Try again.",
      );
      setSaving(false);
    }
  }

  if (working === null) {
    return (
      <>
        <Stack.Screen options={{ title: "Edit" }} />
        <View style={[styles.container, styles.onlyStatus]}>
          <Text style={styles.quiet}>
            {result === undefined
              ? "Loading…"
              : "Andy doesn't have anyone by that link."}
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Edit ${saved?.name ?? ""}`.trim() }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            value={working.name}
            onChangeText={(name) => edit({ name })}
            style={styles.input}
            accessibilityLabel="Name"
          />
          <Text style={styles.hint}>
            Andy files a new note under the name it hears, so this is what the
            next one has to match.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Who or what</Text>
          <View style={styles.row}>
            {(["person", "animal"] as const).map((kind) => (
              <Pressable
                key={kind}
                accessibilityRole="button"
                accessibilityLabel={kind}
                accessibilityState={{ selected: working.entityType === kind }}
                onPress={() => edit({ entityType: kind })}
                style={[
                  styles.choice,
                  working.entityType === kind && styles.choiceOn,
                ]}
              >
                <Text
                  style={[
                    styles.choiceLabel,
                    working.entityType === kind && styles.choiceLabelOn,
                  ]}
                >
                  {kind}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>How you know them</Text>
          <TextInput
            value={working.relationshipContext}
            onChangeText={(relationshipContext) => edit({ relationshipContext })}
            style={styles.input}
            placeholder="client, friend, foster…"
            placeholderTextColor={colors.line}
            accessibilityLabel="How you know them"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>First met</Text>
          <TextInput
            value={working.firstMetDate}
            onChangeText={(firstMetDate) => edit({ firstMetDate })}
            style={styles.input}
            placeholder="2026-08-31"
            placeholderTextColor={colors.line}
            accessibilityLabel="First met"
          />
          <Text style={styles.hint}>
            Leave empty if you&apos;d rather not say.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tags</Text>
          {working.tags.map((tag, index) => (
            <TextInput
              key={index}
              value={tag}
              onChangeText={(value) =>
                edit({
                  tags: working.tags.map((t, i) => (i === index ? value : t)),
                })
              }
              style={styles.input}
              accessibilityLabel={`Tag ${index + 1}`}
            />
          ))}
          <View style={styles.tagActions}>
            <Text style={styles.hint}>Clearing a tag removes it.</Text>
            {/* Without this a profile can only ever gain tags from an
                extraction, which makes the field read-only in practice for
                anybody who types their notes. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a tag"
              onPress={() => edit({ tags: [...working.tags, ""] })}
              hitSlop={8}
            >
              <Text style={styles.addTag}>Add a tag</Text>
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save changes"
          onPress={() => void save()}
          disabled={saving}
          style={[styles.save, saving && styles.disabled]}
        >
          <Text style={styles.saveLabel}>
            {saving ? "Saving…" : "Save changes"}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 24, gap: 24, paddingBottom: 40 },
  onlyStatus: { justifyContent: "center", alignItems: "center", padding: 24 },

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
  hint: { color: colors.ink, fontSize: 12, opacity: 0.5, flex: 1 },
  quiet: { color: colors.ink, fontSize: 15, opacity: 0.6, lineHeight: 22 },
  error: { color: colors.alert, fontSize: 14, lineHeight: 21 },

  row: { flexDirection: "row", gap: 8 },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  choiceOn: { backgroundColor: colors.moss, borderColor: colors.moss },
  choiceLabel: { color: colors.ink, fontSize: 15 },
  choiceLabelOn: { color: colors.paper },

  tagActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  addTag: { color: colors.moss, fontSize: 13 },

  save: {
    backgroundColor: colors.moss,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveLabel: { color: colors.paper, fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
