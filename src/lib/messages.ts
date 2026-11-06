import { hasNativeModule } from "./native";

/**
 * Apple's Messages composer, filled in, for the person to address and send
 * themselves — Andy never sends anything (Write to → Open Messages,
 * draft-editing.md, Final design).
 *
 * Through `expo-sms` rather than an `sms:` link: its `isAvailableAsync` is
 * iOS's own "can this device send texts" (false on an iPad or iPod without
 * SMS, and always false in the simulator), which is exactly when the design
 * hides the button; and its composer opens over the sheet, so coming back
 * finds the sheet as it was. A prefilled body on an `sms:` link with no
 * recipient has no current documentation (docs-verifier, 2026-11-06).
 *
 * Asked for before it is loaded, as the clipboard is (`src/lib/clipboard.ts`):
 * a dev app built before this module was added must lose one button, not the
 * profile screen.
 */
function sms(): typeof import("expo-sms") | null {
  if (!hasNativeModule("ExpoSMS")) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-sms") as typeof import("expo-sms");
}

/** Whether this phone can send a text from Andy's composer. */
export async function canSendTexts(): Promise<boolean> {
  try {
    return (await sms()?.isAvailableAsync()) ?? false;
  } catch {
    return false;
  }
}

/**
 * Open the composer with `text` in it and no one to send it to yet.
 * "cancelled" when the person closed it without sending, "sent" otherwise (iOS
 * says "unknown" when it can't tell, which counts as sent: the text may have
 * gone), and "failed" when it could not open at all.
 */
export async function openMessages(text: string): Promise<"sent" | "cancelled" | "failed"> {
  const module = sms();
  if (module === null) return "failed";
  try {
    const { result } = await module.sendSMSAsync([], text);
    return result === "cancelled" ? "cancelled" : "sent";
  } catch {
    return "failed";
  }
}
