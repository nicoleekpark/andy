import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Animated,
  type GestureResponderEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { ConfirmHost, useConfirm } from "@/components/confirm-dialog";
import { colors, radius, size, space, textOpacity, textSize } from "@/constants/theme";
import { useOffline } from "@/lib/connection";
import { hasNativeModule } from "@/lib/native";
import { useReduceMotion } from "@/lib/use-reduce-motion";

/**
 * The three ways into a new note, fanned out from the button that opened them
 * (`docs/design/decisions/capture-doors.md`, Final choice: the orbit).
 *
 * Voice at 12 o'clock, Write at 10, Photo at 2 — symmetric around the trigger,
 * so it is the same for either hand. The screen dims behind them; tapping the
 * dimmed area or ✕ closes it. Each door is a moss circle with its word on a
 * paper chip beneath: never words straight on the scrim, which is not a
 * reliable 4.5:1 backdrop.
 *
 * The same orbit opens from home's round + and from a person's "Add a note";
 * from a person's page every door is about them (the route says so).
 */

export type Door = "voice" | "write" | "photo";

const DOORS: { door: Door; word: string; symbol: SymbolViewProps["name"]; dx: number; dy: number }[] = [
  // Radius 120 from the trigger's centre: Voice straight up, Write and Photo
  // 60° either side of it.
  { door: "voice", word: "Voice", symbol: "mic.fill", dx: 0, dy: -120 },
  { door: "write", word: "Write", symbol: "pencil", dx: -104, dy: -60 },
  { door: "photo", word: "Photo", symbol: "camera.fill", dx: 104, dy: -60 },
];

/** A door's circle — smaller than the trigger, which stays the one primary. */
const DOOR_SIZE = size.touch + space.md;

/** Past this text size the fan cannot hold its words; it becomes a list. */
const STACK_FROM_FONT_SCALE = 1.5;

type Anchor = { cx: number; cy: number };

/**
 * The orbit for one trigger: `open` for its press (it measures the trigger
 * from the press itself), and the orbit to render. `base` is the capture route the
 * doors open — `/capture` from home, `/profile/<id>/capture` from a page.
 */
/** Where the doors lead: capture from home, or capture about one person. */
export type CaptureBase = "/capture" | `/profile/${string}/capture`;

export function useCaptureOrbit(base: CaptureBase): {
  open: (event?: GestureResponderEvent) => void;
  isOpen: boolean;
  orbit: ReactNode;
} {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const { width, height } = useWindowDimensions();
  const offline = useOffline();
  const confirm = useConfirm();

  const open = useCallback(
    (event?: GestureResponderEvent) => {
      // Shown at once, near the bottom centre, then moved onto the trigger
      // once it has been measured — so a slow measure never eats the tap.
      setAnchor({ cx: width / 2, cy: height - size.round });
      const trigger = event?.currentTarget as unknown as View | undefined;
      trigger?.measureInWindow?.((x, y, w, h) => {
        if (w > 0) setAnchor({ cx: x + w / 2, cy: y + h / 2 });
      });
      tapFeedback();
    },
    [width, height],
  );

  const close = useCallback(() => setAnchor(null), []);

  const choose = useCallback(
    (door: Door) => {
      if (door === "photo" && offline) {
        // Said before anything opens — never a camera that opens and then
        // fails — over the orbit, which stays open behind it: Cancel goes
        // back to the doors, Write instead takes the way out the voice screen
        // offers too (decision B).
        confirm(
          "Reading a photo needs a connection.",
          "Take it with your Camera now and choose it here later, or write it instead.",
          [
            {
              text: "Write instead",
              onPress: () => {
                setAnchor(null);
                router.push(`${base}?door=write`);
              },
            },
            { text: "Cancel", style: "cancel" },
          ],
        );
        return;
      }
      setAnchor(null);
      router.push(`${base}?door=${door}`);
    },
    [base, confirm, offline],
  );

  return {
    open,
    isOpen: anchor !== null,
    orbit:
      anchor === null ? null : (
        <CaptureOrbit anchor={anchor} offline={offline} onClose={close} onChoose={choose} />
      ),
  };
}

/** A light tap as it opens; nothing on a build without the haptics module. */
function tapFeedback() {
  if (!hasNativeModule("ExpoHaptics")) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Haptics = require("expo-haptics") as typeof import("expo-haptics");
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function CaptureOrbit({
  anchor,
  offline,
  onClose,
  onChoose,
}: {
  anchor: Anchor;
  offline: boolean;
  onClose: () => void;
  onChoose: (door: Door) => void;
}) {
  const { fontScale, width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const stacked = fontScale >= STACK_FROM_FONT_SCALE;
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion === null) return;
    Animated.timing(progress, {
      toValue: 1,
      // Reduce Motion: a short fade, nothing moves.
      duration: reduceMotion ? 120 : 180,
      useNativeDriver: true,
    }).start();
  }, [progress, reduceMotion]);

  const meta = (door: Door) => (door === "photo" && offline ? "Needs a connection" : null);

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* The dimmed screen: tapping it closes, like ✕. Not a stop for VoiceOver. */}
      <Pressable
        style={[StyleSheet.absoluteFill, styles.scrim]}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
        testID="capture-orbit-scrim"
      />
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        testID="capture-orbit"
      >
        {stacked ? (
          // At the largest text sizes the fan becomes a plain list, in the
          // same order, above the trigger.
          <View style={[styles.list, { bottom: undefined, top: anchor.cy - size.round - space.lg, width: width - space.xl * 2 }]}>
            <View style={styles.listInner}>
              {DOORS.map((d) => (
                <Pressable
                  key={d.door}
                  accessibilityRole="button"
                  accessibilityLabel={meta(d.door) ? `${d.word}, ${meta(d.door)}` : d.word}
                  onPress={() => onChoose(d.door)}
                  style={styles.listItem}
                >
                  <Text style={styles.chipWord}>{d.word}</Text>
                  {meta(d.door) ? <Text style={styles.chipMeta}>{meta(d.door)}</Text> : null}
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          DOORS.map((d) => {
            const shift = (to: number) =>
              reduceMotion ? to : progress.interpolate({ inputRange: [0, 1], outputRange: [0, to] });
            return (
              <Animated.View
                key={d.door}
                style={[
                  styles.door,
                  {
                    left: anchor.cx - DOOR_SIZE,
                    top: anchor.cy - DOOR_SIZE / 2,
                    opacity: progress,
                    transform: [{ translateX: shift(d.dx) }, { translateY: shift(d.dy) }],
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  // Starts with the word on screen (WCAG 2.5.3).
                  accessibilityLabel={meta(d.door) ? `${d.word}, ${meta(d.door)}` : d.word}
                  onPress={() => onChoose(d.door)}
                  style={styles.doorPress}
                  testID={`capture-orbit-item--${d.door}`}
                >
                  <View style={styles.circle}>
                    <SymbolView
                      name={d.symbol}
                      size={size.icon}
                      tintColor={colors.paper}
                      fallback={<Text style={styles.closeWord}>{d.word}</Text>}
                    />
                  </View>
                  <View style={styles.chip}>
                    <Text style={styles.chipWord}>{d.word}</Text>
                    {meta(d.door) ? <Text style={styles.chipMeta}>{meta(d.door)}</Text> : null}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })
        )}

        {/* The trigger, become ✕, where it was. Last for VoiceOver. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={[
            styles.close,
            { left: anchor.cx - size.round / 2, top: anchor.cy - size.round / 2 },
          ]}
          testID="capture-orbit-close"
        >
          <SymbolView
            name="xmark"
            size={size.icon}
            tintColor={colors.paper}
            fallback={<Text style={styles.closeWord}>Close</Text>}
          />
        </Pressable>
        {/*
          A dialog asked while the orbit is open is drawn here, above it: iOS
          puts a native modal above the whole app, so the app's own host would
          sit behind the orbit (the same reason `draft-sheet.tsx` has one).
          Inside the VoiceOver-modal view, not beside it — beside it, VoiceOver
          could not reach the dialog at all.
        */}
        <ConfirmHost inModal />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.scrim },
  // Twice a door's width, so the chip under it can be wider than the circle.
  door: { position: "absolute", width: DOOR_SIZE * 2, alignItems: "center" },
  doorPress: { alignItems: "center", gap: space.xs },
  circle: {
    width: DOOR_SIZE,
    height: DOOR_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.moss,
    alignItems: "center",
    justifyContent: "center",
  },
  // The word on a solid paper chip, never on the scrim itself.
  chip: {
    backgroundColor: colors.paper,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    alignItems: "center",
  },
  chipWord: { color: colors.ink, fontSize: textSize.base, fontWeight: "600" },
  chipMeta: { color: colors.ink, fontSize: textSize.xs, opacity: textOpacity.quiet },
  close: {
    position: "absolute",
    width: size.round,
    height: size.round,
    borderRadius: radius.pill,
    backgroundColor: colors.moss,
    alignItems: "center",
    justifyContent: "center",
  },
  closeWord: { color: colors.paper, fontSize: textSize.md },
  list: { position: "absolute", left: space.xl, transform: [{ translateY: "-100%" }] },
  listInner: { gap: space.sm },
  listItem: {
    backgroundColor: colors.paper,
    borderRadius: radius.control,
    minHeight: size.touch,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    justifyContent: "center",
  },
});
