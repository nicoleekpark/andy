import { CameraView, useCameraPermissions } from "expo-camera";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, size, space, textSize } from "@/constants/theme";
import { shrinkForReading } from "@/lib/photo-size";

/**
 * Andy's own camera, the Photo door (`capture-doors.md`, Final choice: the
 * Photo screens): full screen, ✕ top-left, the hint, the shutter in the
 * middle and the album bottom-left where the iPhone Camera keeps it.
 *
 * The one dark screen in Andy: a viewfinder on paper would fight the picture.
 * Its dark is `ink`, not a new colour.
 *
 * The camera is asked for here, once, at the moment of use. Refused, the
 * viewfinder becomes a line and "Choose a photo instead" — the album needs no
 * permission at all (#155).
 */
export function PhotoCamera({
  visible,
  onClose,
  onPicture,
  onChooseFromLibrary,
}: {
  visible: boolean;
  onClose: () => void;
  /** A picture, already small enough to be read. */
  onPicture: (picture: { uri: string; base64: string }) => void;
  onChooseFromLibrary: () => void;
}) {
  const [answer, requestPermission] = useCameraPermissions();
  // Not known yet until iOS has answered.
  const permission = answer ?? null;
  const camera = useRef<CameraView>(null);
  const [taking, setTaking] = useState(false);
  const [failed, setFailed] = useState(false);
  const insets = useSafeAreaInsets();
  // Not answered yet: ask, once, now that the camera is on screen. In an
  // effect, not in render: asking shows iOS's own question.
  const asked = useRef(false);
  useEffect(() => {
    if (!visible || permission === null || permission.granted || !permission.canAskAgain) return;
    if (asked.current) return;
    asked.current = true;
    void requestPermission();
  }, [visible, permission, requestPermission]);
  // Refused for good: iOS will not ask again, so only Settings can undo it.
  const refused = permission !== null && !permission.granted && !permission.canAskAgain;

  async function shoot() {
    if (taking || camera.current === null) return;
    setTaking(true);
    setFailed(false);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 1, exif: false });
      onPicture(await shrinkForReading(picture.uri, picture.width, picture.height));
    } catch {
      setFailed(true);
    } finally {
      setTaking(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="photo-camera">
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.close}
            testID="photo-camera-close"
          >
            <SymbolView
              name="xmark"
              size={size.icon}
              tintColor={colors.paper}
              fallback={<Text style={styles.word}>Close</Text>}
            />
          </Pressable>
        </View>

        {refused ? (
          <View style={styles.off} testID="photo-camera-off">
            <Text style={styles.offLine}>
              Andy needs the camera to take a photo. Turn it on in Settings, or choose a photo instead.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose a photo instead"
              onPress={onChooseFromLibrary}
              style={styles.instead}
            >
              <Text style={styles.insteadLabel}>Choose a photo instead</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.viewfinder}>
            {permission?.granted ? (
              <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />
            ) : null}
            <Text style={styles.hint} testID="photo-camera-hint">
              {failed ? "That photo didn't come through. Try again." : "A card, a page of notes, or a screenshot."}
            </Text>
          </View>
        )}

        <View style={styles.bottom}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose from library"
            onPress={onChooseFromLibrary}
            style={styles.album}
            testID="photo-camera-album"
          >
            <SymbolView
              name="photo.on.rectangle"
              size={size.icon}
              tintColor={colors.paper}
              fallback={<Text style={styles.word}>Album</Text>}
            />
          </Pressable>
          {refused ? (
            <View style={styles.shutterSpace} />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              onPress={() => void shoot()}
              disabled={taking || !permission?.granted}
              style={[styles.shutter, (taking || !permission?.granted) && styles.disabled]}
              testID="photo-camera-shutter"
            >
              <View style={styles.shutterInner} />
            </Pressable>
          )}
          <View style={styles.album} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  top: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  close: { width: size.touch, height: size.touch, alignItems: "center", justifyContent: "center" },
  word: { color: colors.paper, fontSize: textSize.sm },
  viewfinder: { flex: 1, justifyContent: "flex-end", overflow: "hidden" },
  // On the picture itself: full paper, never dimmed, so it reads over
  // whatever the lens sees.
  hint: {
    color: colors.paper,
    fontSize: textSize.base,
    textAlign: "center",
    padding: space.lg,
  },
  off: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg, padding: space.xl },
  offLine: { color: colors.paper, fontSize: textSize.md, textAlign: "center" },
  instead: {
    backgroundColor: colors.moss,
    borderRadius: radius.pill,
    minHeight: size.touch,
    paddingHorizontal: space.xl,
    justifyContent: "center",
  },
  insteadLabel: { color: colors.paper, fontSize: textSize.base, fontWeight: "600" },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  album: {
    width: size.touch + space.md,
    height: size.touch + space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  shutter: {
    width: size.round,
    height: size.round,
    borderRadius: radius.pill,
    borderWidth: space.xs,
    borderColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: {
    width: size.round - space.lg,
    height: size.round - space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.paper,
  },
  shutterSpace: { width: size.round, height: size.round },
  disabled: { opacity: 0.5 },
});
