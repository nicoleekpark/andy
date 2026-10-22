import { Stack, router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useConfirm } from "@/components/confirm-dialog";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useJustAdded } from "@/lib/use-just-added";
import { FORM_SCROLL } from "@/lib/form-scroll";
import { useRowKeys } from "@/lib/use-row-keys";
import { AddLine, RemovableLine } from "@/components/removable-line";
import { givenName, matchKey } from "@convex/naming";
import { colors, textOpacity } from "@/constants/theme";
import { userMessage } from "@/lib/user-message";
import { NOTHING_KEPT_OFFLINE, useLiveOrCopy, useOnline } from "@/lib/offline-copy";
import { personFields, usePending } from "@/lib/pending-changes";
import { withNotesView } from "@convex/offlineViews";

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
  const confirm = useConfirm();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Offline, the person from the phone's copy (with any waiting changes); a
  // change made here is kept on the phone and saved on Sync
  // (`pending-changes.tsx`, decided 2026-10-08).
  const { data: result } = useLiveOrCopy(
    useQuery(api.profiles.withNotes, { profileId: id }),
    (copy) => withNotesView(id, copy.profiles, copy.notes, copy.links, null),
  );
  const online = useOnline();
  const pending = usePending();
  /** Offline, or this person already has a change waiting: to the phone. */
  const keepOnPhone = pending.available && (!online || pending.touches(id));
  const updateProfile = useMutation(api.profiles.updateProfile);
  const removeProfile = useMutation(api.profiles.remove);

  type Draft = {
    name: string;
    entityType: "person" | "animal";
    relationshipContext: string;
    firstMetDate: string;
    tags: string[];
    aliases: string[];
  };

  const { markAdded, focusProps } = useJustAdded<string>();
  const [edits, setEdits] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The table stores "not known" as an absent field; a form has to show it as
  // an empty box, and `updateProfile` converts back on the way in. One mapping
  // (`personFields`), shared with what Sync compares against.
  const saved: Draft | null =
    result === undefined || result === null ? null : personFields(result.profile);
  const working = edits ?? saved;
  // Removing a line (⊖ then Delete, or leaving it empty, device QA B5-9)
  // calls removeKey in the same handler that shortens the array, so every
  // other line keeps its key — and its focus — when one in the middle goes.
  const aliasKeys = useRowKeys(working?.aliases.length ?? 0);
  const tagKeys = useRowKeys(working?.tags.length ?? 0);
  /**
   * The first name Andy derives from theirs (B5-8) — unless it is already one
   * of the names below, where saying it twice would look like the duplicate
   * the derivation exists to avoid.
   */
  const given = working === null ? null : givenName(working.name);
  const alsoKnownAs =
    given !== null && !working!.aliases.some((alias) => matchKey(alias) === matchKey(given))
      ? given
      : null;
  /** The line whose ⊖ was tapped, so its Delete is showing (device QA B5-9). */
  const [armed, setArmed] = useState<string | null>(null);
  /** The line that was empty when it took focus, if any (see its onBlur). */
  const emptyWhenTouched = useRef<string | null>(null);
  function removeAlias(index: number) {
    if (working === null) return;
    aliasKeys.removeKey(index);
    setArmed(null);
    edit({ aliases: working.aliases.filter((_, i) => i !== index) });
  }
  function removeTag(index: number) {
    if (working === null) return;
    tagKeys.removeKey(index);
    setArmed(null);
    edit({ tags: working.tags.filter((_, i) => i !== index) });
  }

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
      if (keepOnPhone) {
        pending.add({
          kind: "updateProfile",
          profileId: id,
          fields: working,
          base: saved ?? working,
        });
      } else {
        await updateProfile({ profileId: id, ...working });
      }

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
        userMessage(e, "Andy couldn't save that change. Try again."),
      );
      setSaving(false);
    }
  }

  /**
   * Deleting the person, behind a confirmation that says what that means.
   *
   * Three things, because each is a surprise otherwise:
   *
   * The count. "Delete 지선?" reads the same for an empty row created from a
   * passing mention and for four years of notes, and those are not the same
   * decision. `result.notes` is already on this screen, so saying so is free.
   *
   * What follows them out. People who only ever appeared inside their notes go
   * too — nothing else refers to those rows, and leaving them would strand
   * names nobody can reach. Somebody who has notes of their own stays.
   *
   * What does not. Where this person was named in somebody else's note, the
   * note keeps the name; it only stops opening anything. Quietly removing it
   * would rewrite what that note recorded.
   *
   * Home rather than back, because back is this person's profile and it no
   * longer exists.
   */
  const confirmDelete = () => {
    if (result === undefined || result === null) {
      return;
    }
    const noteCount = result.notes.length;
    const lost =
      noteCount === 0
        ? "There are no notes to lose."
        : `${noteCount} ${noteCount === 1 ? "note" : "notes"} go with them, for good.`;
    confirm(
      `Delete ${result.profile.name}?`,
      `${lost}\n\n` +
        "Anyone who only ever came up inside those notes goes too. People with notes of their own stay.\n\n" +
        `Where ${result.profile.name} was mentioned in someone else's note, that note keeps the name — it just stops opening anything.\n\n` +
        "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setError(null);
              try {
                if (keepOnPhone && saved !== null) {
                  pending.add({ kind: "removeProfile", profileId: id, base: saved });
                  router.dismissTo("/");
                  return;
                }
                await removeProfile({ profileId: id });
                // Back to the home already underneath, not a new one on top:
                // replace() swapped only this screen and left the deleted
                // person's profile below home, as its back button.
                router.dismissTo("/");
              } catch (e) {
                setError(
                  userMessage(e, "Andy couldn't delete them. Try again."),
                );
              }
            })();
          },
        },
      ],
    );
  };

  if (working === null) {
    return (
      <>
        <Stack.Screen options={{ title: "Edit" }} />
        <View style={[styles.container, styles.onlyStatus]}>
          <Text style={styles.quiet}>
            {result === undefined
              ? online
                ? "Loading…"
                : NOTHING_KEPT_OFFLINE
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
        {...FORM_SCROLL}
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
          {alsoKnownAs !== null ? (
            // Derived from the name, never stored, nothing to edit (B5-8).
            <Text style={styles.hint} testID="name-also-known">
              Andy also knows them as “{alsoKnownAs}”.
            </Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Also known as</Text>
          {working.aliases.map((alias, index) => {
            const line = `alias-${aliasKeys.keys[index]}`;
            return (
              <RemovableLine
                key={aliasKeys.keys[index]}
                what={alias.trim() === "" ? "this name" : `the name ${alias.trim()}`}
                armed={armed === line}
                onArm={() => setArmed(armed === line ? null : line)}
                onRemove={() => removeAlias(index)}
              >
                <TextInput
                  value={alias}
                  onChangeText={(value) =>
                    edit({
                      aliases: working.aliases.map((a, i) =>
                        i === index ? value : a,
                      ),
                    })
                  }
                  // Touching the line again changes your mind about Delete;
                  // leaving it empty takes it away (device QA B5-9).
                  onBlur={() => {
                    // Only a line that was empty when it was touched — one just
                    // added and never written in. A name cleared by mistake
                    // stays until Save, so nothing is lost to one stray touch
                    // (the same promise as ⊖ then Delete).
                    if (alias.trim() === "" && emptyWhenTouched.current === `alias-${index}`) {
                      removeAlias(index);
                    }
                  }}
                  style={styles.input}
                  autoFocus={focusProps(`alias-${index}`).autoFocus}
                  onFocus={() => {
                    focusProps(`alias-${index}`).onFocus();
                    setArmed(null);
                    emptyWhenTouched.current = alias.trim() === "" ? `alias-${index}` : null;
                  }}
                  accessibilityLabel={`Other name ${index + 1}`}
                />
              </RemovableLine>
            );
          })}
          {/*
            The other half of matching. Two people sharing a name is settled
            by asking which; one person answering to several is settled here,
            once, instead of the same question being asked every time they
            come up under a name Andy has not been told about.
          */}
          <AddLine
            label="Add a name"
            onPress={() => {
              markAdded(`alias-${working.aliases.length}`);
              edit({ aliases: [...working.aliases, ""] });
            }}
          />
          <Text style={styles.hint}>Andy will recognise these too. An empty line is removed when you save.</Text>
        </View>

        {/*
          No Person / Animal choice in V1 — people only. A profile that is
          already an animal keeps that: `working.entityType` is still sent
          unchanged on save.
        */}

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>How you know them</Text>
          <TextInput
            value={working.relationshipContext}
            onChangeText={(relationshipContext) => edit({ relationshipContext })}
            style={styles.input}
            placeholder="client, friend, foster…"
            placeholderTextColor={colors.placeholder}
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
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="First met"
          />
          <Text style={styles.hint}>
            Leave empty if you&apos;d rather not say.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tags</Text>
          {working.tags.map((tag, index) => {
            const line = `tag-${tagKeys.keys[index]}`;
            return (
              <RemovableLine
                key={tagKeys.keys[index]}
                what={tag.trim() === "" ? "this tag" : `the tag ${tag.trim()}`}
                armed={armed === line}
                onArm={() => setArmed(armed === line ? null : line)}
                onRemove={() => removeTag(index)}
              >
                <TextInput
                  value={tag}
                  onChangeText={(value) =>
                    edit({
                      tags: working.tags.map((t, i) => (i === index ? value : t)),
                    })
                  }
                  onBlur={() => {
                    // Only a line that was empty when it was touched — one just
                    // added and never written in. A name cleared by mistake
                    // stays until Save, so nothing is lost to one stray touch
                    // (the same promise as ⊖ then Delete).
                    if (tag.trim() === "" && emptyWhenTouched.current === `tag-${index}`) {
                      removeTag(index);
                    }
                  }}
                  style={styles.input}
                  autoFocus={focusProps(`tag-${index}`).autoFocus}
                  onFocus={() => {
                    focusProps(`tag-${index}`).onFocus();
                    setArmed(null);
                    emptyWhenTouched.current = tag.trim() === "" ? `tag-${index}` : null;
                  }}
                  accessibilityLabel={`Tag ${index + 1}`}
                />
              </RemovableLine>
            );
          })}
          {/* Without this a profile can only ever gain tags from an
              extraction, which makes the field read-only in practice for
              anybody who types their notes. */}
          <AddLine
            label="Add a tag"
            onPress={() => {
              markAdded(`tag-${working.tags.length}`);
              edit({ tags: [...working.tags, ""] });
            }}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!online ? (
          <Text testID="edit-offline-hint" style={styles.quiet}>
            You&apos;re offline. Changes are kept on this phone until you Sync.
          </Text>
        ) : null}

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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete this person"
          onPress={confirmDelete}
          disabled={saving}
          style={styles.delete}
        >
          <Text style={styles.deleteLabel}>
            Delete {saved?.name ?? "this person"}
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
    opacity: textOpacity.quiet,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  // The field's only visible edge: `edge`, 3:1 (WCAG 1.4.11), and a whole point wide.
  input: {
    color: colors.ink,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.edge,
    paddingVertical: 8,
  },
  hint: { color: colors.ink, fontSize: 12, opacity: textOpacity.quiet, flex: 1 },
  quiet: { color: colors.ink, fontSize: 15, opacity: textOpacity.quiet, lineHeight: 22 },
  error: { color: colors.alert, fontSize: 14, lineHeight: 21 },


  save: {
    backgroundColor: colors.moss,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveLabel: { color: colors.paper, fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.5 },

  delete: { alignItems: "center", paddingVertical: 8 },
  deleteLabel: { color: colors.alert, fontSize: 15 },
});
