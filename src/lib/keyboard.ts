import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

/**
 * How much of the screen the keyboard covers, in points; 0 while it is down.
 * Home's bar rises by exactly this (R8); Write to keeps its boxes short enough
 * to leave a strip above it to scroll by.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardWillShow", (event) =>
      setHeight(event.endCoordinates.height),
    );
    // The emoji keyboard or the predictive bar changes the height while it is up.
    const changed = Keyboard.addListener("keyboardWillChangeFrame", (event) =>
      setHeight((now) => (now === 0 ? now : event.endCoordinates.height)),
    );
    const hidden = Keyboard.addListener("keyboardWillHide", () => setHeight(0));
    return () => {
      shown.remove();
      changed.remove();
      hidden.remove();
    };
  }, []);
  return height;
}
