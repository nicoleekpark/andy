import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius, space, textOpacity, textSize } from "@/constants/theme";

/**
 * Andy's own confirmation dialog, in place of `Alert.alert`.
 *
 * Why not the native alert: iOS presents it in its own window above the whole
 * React tree, so the app lock — an overlay inside that tree — cannot cover it,
 * and React Native has no way to close it. A confirmation left open across a
 * trip to another app sat on top of "Andy is locked.", showing "Delete
 * Marcus?" to whoever held the phone, with its buttons live (device QA build 4
 * #51). This one is drawn inside the tree, under the lock: locked, it is
 * covered and takes no touches; unlocked, it is still there, as it was left.
 *
 * Same shape as `Alert.alert(title, message, buttons)` on purpose, so a call
 * site changes one name and nothing else.
 */
export type ConfirmButton = {
  text: string;
  /**
   * `cancel` is drawn as plain text at the bottom. `destructive` is drawn in
   * `alert`, which STYLE.md allows only for deleting a note, a person or the
   * account; anything else is a `moss` button.
   */
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type Dialog = {
  id: number;
  title: string;
  message?: string;
  buttons: ConfirmButton[];
};

type Confirm = (
  title: string,
  message?: string,
  buttons?: ConfirmButton[],
) => void;

const ConfirmContext = createContext<{
  open: (dialog: Omit<Dialog, "id">) => number;
  close: (id: number) => void;
  current: Dialog | undefined;
  /** How many hosts inside native modals are mounted right now. */
  modalHosts: number;
  setModalHosts: (change: (count: number) => number) => void;
} | null>(null);

let nextId = 1;

/**
 * Holds the dialogs. Kept above everything that may ask (the Sync provider
 * asks too), while `ConfirmHost` draws them where the lock can cover them.
 * One at a time, in the order asked, as iOS does.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Dialog[]>([]);
  const [modalHosts, setModalHosts] = useState(0);

  const open = useCallback((dialog: Omit<Dialog, "id">) => {
    const id = nextId++;
    setQueue((all) => [...all, { ...dialog, id }]);
    return id;
  }, []);
  const close = useCallback((id: number) => {
    setQueue((all) => all.filter((dialog) => dialog.id !== id));
  }, []);

  const value = useMemo(
    () => ({ open, close, current: queue[0], modalHosts, setModalHosts }),
    [open, close, queue, modalHosts],
  );
  return (
    <ConfirmContext.Provider value={value}>{children}</ConfirmContext.Provider>
  );
}

/**
 * Ask something, the way `Alert.alert` would. A dialog asked by a screen goes
 * when that screen does: answering it afterwards would act on a screen that is
 * no longer there.
 */
export function useConfirm(): Confirm {
  const context = useContext(ConfirmContext);
  if (context === null)
    throw new Error("useConfirm needs a ConfirmProvider above it");
  const { open, close } = context;

  const mine = useRef(new Set<number>());
  useEffect(() => {
    const opened = mine.current;
    return () => opened.forEach(close);
  }, [close]);

  return useCallback(
    (title, message, buttons = [{ text: "OK" }]) => {
      mine.current.add(open({ title, message, buttons }));
    },
    [open],
  );
}

/**
 * Draws the dialog asked first. Place it inside what the lock covers.
 *
 * `inModal` is for a host inside a native `<Modal>` (the `draft` sheet): iOS
 * draws a modal above the whole app, so a dialog drawn by the app's own host
 * would sit behind the sheet that asked it. While a modal's host is mounted,
 * it draws and the app's host does not — one dialog, never two. A modal hides
 * itself under the lock (`LockedContext`), which unmounts its host and hands
 * the dialog back to the app's host, where the lock covers it.
 */
export function ConfirmHost({ inModal = false }: { inModal?: boolean }) {
  const context = useContext(ConfirmContext);
  const setModalHosts = context?.setModalHosts;
  useEffect(() => {
    if (!inModal || setModalHosts === undefined) return;
    setModalHosts((count) => count + 1);
    return () => setModalHosts((count) => count - 1);
  }, [inModal, setModalHosts]);

  const dialog = context?.current;
  if (context === null || dialog === undefined) return null;
  if (!inModal && context.modalHosts > 0) return null;

  const answer = (button: ConfirmButton) => {
    context.close(dialog.id);
    button.onPress?.();
  };
  const actions = dialog.buttons.filter((button) => button.style !== "cancel");
  const cancel = dialog.buttons.find((button) => button.style === "cancel");

  return (
    <View style={styles.scrim}>
      <View
        style={styles.card}
        testID="confirm-dialog"
        accessibilityViewIsModal
        accessibilityRole="alert"
      >
        <Text style={styles.title} accessibilityRole="header">
          {dialog.title}
        </Text>
        {/*
          The message scrolls, the buttons do not: deleting a person explains
          four things, and at the largest text sizes on a small phone that
          would otherwise push Delete and Cancel off the screen. The native
          alert this replaces scrolled for the same reason.
        */}
        {dialog.message ? (
          <ScrollView style={styles.messageScroll}>
            <Text style={styles.message}>{dialog.message}</Text>
          </ScrollView>
        ) : null}
        <View style={styles.buttons}>
          {actions.map((button, index) => (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={button.text}
              onPress={() => answer(button)}
              style={[
                styles.pill,
                button.style === "destructive" && styles.destructive,
              ]}
            >
              <Text style={styles.pillLabel}>{button.text}</Text>
            </Pressable>
          ))}
          {cancel === undefined ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cancel.text}
              onPress={() => answer(cancel)}
              hitSlop={space.sm}
              style={styles.plain}
            >
              <Text style={styles.plainLabel}>{cancel.text}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    paddingHorizontal: space.xxl,
    paddingVertical: space.xxxl,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radius.card,
    padding: space.xl,
    gap: space.md,
    maxHeight: "100%",
  },
  messageScroll: { flexGrow: 0, flexShrink: 1 },
  title: { color: colors.ink, fontSize: textSize.xxl, fontWeight: "600" },
  message: { color: colors.ink, fontSize: textSize.base, opacity: textOpacity.secondary },
  buttons: { gap: space.sm, marginTop: space.sm },
  pill: {
    backgroundColor: colors.moss,
    borderRadius: radius.pill,
    paddingVertical: space.lg,
    alignItems: "center",
  },
  destructive: { backgroundColor: colors.alert },
  pillLabel: { color: colors.paper, fontSize: textSize.lg, fontWeight: "600" },
  plain: { paddingVertical: space.md, alignItems: "center" },
  plainLabel: { color: colors.ink, fontSize: textSize.base, opacity: textOpacity.quiet },
});
