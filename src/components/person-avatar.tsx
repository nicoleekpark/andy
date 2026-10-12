import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius, size, textSize } from "../constants/theme";

/**
 * `profile-row-avatar`: the person's photo, or their initials in a circle when
 * there is none — so names line up down the list and a row reads as a person,
 * the way Contacts does it (device QA #8, decided 2026-10-11).
 *
 * Decoration to VoiceOver: the row's own label already says who it is, and a
 * photo of a face has nothing to add to a name.
 */

/**
 * Up to two letters: the first of the first word and the first of the last.
 * "Emily Watson" → "EW", "Marcus" → "M", "김지선" → "김". By code point, so a
 * name starting with an emoji or an accented letter keeps it whole.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== "");
  const first = words[0];
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return [first, last]
    .map((word) => (word === undefined ? "" : (Array.from(word)[0] ?? "")))
    .join("")
    .toLocaleUpperCase();
}

export function PersonAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  /** The URL that failed to load, so a new photo gets its own chance. */
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = photoUrl !== null && photoUrl !== failedUrl;

  return (
    <View
      style={styles.circle}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="profile-row-avatar"
    >
      {showPhoto ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.photo}
          contentFit="cover"
          // A photo that cannot load (deleted elsewhere, signed URL gone,
          // offline before it was ever cached) falls back to the initials
          // rather than leaving an empty ring.
          onError={() => setFailedUrl(photoUrl)}
          testID="profile-row-avatar-photo"
        />
      ) : (
        <Text style={styles.initials} numberOfLines={1} adjustsFontSizeToFit>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: size.avatar,
    height: size.avatar,
    borderRadius: radius.pill,
    // Decoration: the row is what is tapped, and says so to VoiceOver.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photo: { width: size.avatar, height: size.avatar },
  initials: { color: colors.ink, fontFamily: fonts.display, fontSize: textSize.base },
});
