import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAction, useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import * as native from "@/lib/native";
import { answerByName, given, nameOf, quietCall } from "../test-support/convex-mocks";
import { READING_LONG_SIDE } from "@/lib/photo-size";

/**
 * Andy's own camera (Photo 5c, `capture-doors.md`, Final choice: the Photo
 * screens). Native, so both native modules are stood in for here.
 */

const mockTakePicture = jest.fn(async () => ({ uri: "file:///frame.jpg", width: 4032, height: 3024 }));
const mockPermission = { current: { granted: true, canAskAgain: true } as { granted: boolean; canAskAgain: boolean } };
const mockRequestPermission = jest.fn(async () => mockPermission.current);

jest.mock("expo-camera", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  const CameraView = React.forwardRef((props: object, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: (...args: unknown[]) => mockTakePicture(...(args as [])) }));
    return React.createElement(View, { ...props, testID: "camera-view" });
  });
  return {
    CameraView,
    // A fresh object every render, as the real hook gives after each check.
    useCameraPermissions: () => [{ ...mockPermission.current }, mockRequestPermission],
  };
});

const mockResize = jest.fn();
const mockSaveAsync = jest.fn(async () => ({ uri: "file:///small.jpg", base64: "c21hbGw=", width: 2000, height: 1500 }));
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: () => ({
      resize: (...args: unknown[]) => mockResize(...args),
      renderAsync: async () => ({ saveAsync: (...args: unknown[]) => mockSaveAsync(...(args as [])) }),
    }),
  },
}));

function server(readPhoto: jest.Mock) {
  answerByName(useQuery, { "profiles:resolveNames": [], "profiles:people": [] }, () => undefined);
  answerByName(useAction, given({ [nameOf(api.extraction.fromPhoto)]: readPhoto }), quietCall);
}

beforeEach(() => {
  jest.spyOn(native, "hasNativeModule").mockReturnValue(true);
  mockPermission.current = { granted: true, canAskAgain: true };
  mockTakePicture.mockClear();
  mockResize.mockClear();
  mockSaveAsync.mockClear();
  mockRequestPermission.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function openPhotoDoor() {
  const result = renderRouter("src/app", { initialUrl: "/" });
  await result;
  await act(async () => {
    router.push("/capture?door=photo");
  });
  return { getPathname: () => result.getPathname() };
}

test("should open Andy's camera at once through Photo: close, hint, shutter and album", async () => {
  server(jest.fn());
  await openPhotoDoor();

  await waitFor(() => expect(screen.getByTestId("photo-camera")).toBeTruthy());
  expect(screen.getByTestId("camera-view")).toBeTruthy();
  expect(screen.getByText("A card, a page of notes, or a screenshot.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Take photo" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Choose from library" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
});

test("should shrink the picture to a readable size and read it straight away", async () => {
  const readPhoto = jest.fn(async () => ({ about: "Priya", text: "coffee at Tartine" }));
  server(readPhoto);
  await openPhotoDoor();
  await waitFor(() => expect(screen.getByTestId("photo-camera")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Take photo" }));
  });

  // A landscape 12MP frame: its long side brought down, as JPEG with base64.
  expect(mockResize).toHaveBeenCalledWith({ width: READING_LONG_SIDE });
  expect(mockSaveAsync).toHaveBeenCalledWith(expect.objectContaining({ base64: true, format: "jpeg" }));
  await waitFor(() => expect(readPhoto).toHaveBeenCalledWith({ imageBase64: "c21hbGw=", mediaType: "image/jpeg" }));
  await waitFor(() => expect(screen.getByTestId("photo-words")).toBeTruthy());
  // Retake goes back to Andy's camera, not iOS's.
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Retake" }));
  });
  expect(screen.getByTestId("photo-camera")).toBeTruthy();
});

test("should go back to where the note started when the camera is closed with no picture", async () => {
  server(jest.fn());
  const result = await openPhotoDoor();
  await waitFor(() => expect(screen.getByTestId("photo-camera")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Close" }));
  });

  expect(result.getPathname()).toBe("/");
});

test("should say the camera is off when refused, and still offer the album", async () => {
  mockPermission.current = { granted: false, canAskAgain: false };
  server(jest.fn());
  await openPhotoDoor();

  await waitFor(() => expect(screen.getByTestId("photo-camera-off")).toBeTruthy());
  expect(
    screen.getByText("Andy needs the camera to take a photo. Turn it on in Settings, or choose a photo instead."),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Take photo" })).toBeNull();

  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Choose a photo instead" }));
  });
  await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
});

test("should ask for the camera once, when it is first wanted — not again on the next render", async () => {
  mockPermission.current = { granted: false, canAskAgain: true };
  server(jest.fn());
  await openPhotoDoor();

  await waitFor(() => expect(mockRequestPermission).toHaveBeenCalledTimes(1));
  // Something else re-renders the screen while iOS is still asking.
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));
  });
  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
});

test("should keep iOS's camera-or-album question on a build without Andy's camera", async () => {
  jest.spyOn(native, "hasNativeModule").mockImplementation((name) => name !== "ExpoCamera");
  server(jest.fn());
  const { pressConfirmButton } = jest.requireActual<typeof import("../test-support/dialog")>("../test-support/dialog");
  const asked = pressConfirmButton("Cancel");
  await openPhotoDoor();

  await waitFor(() => expect(asked).toHaveBeenCalledWith("Add a photo", expect.any(String), expect.any(Array)));
  expect(screen.queryByTestId("photo-camera")).toBeNull();
});

test("should close the camera and open the album when the album button is pressed", async () => {
  server(jest.fn());
  await openPhotoDoor();
  await waitFor(() => expect(screen.getByTestId("photo-camera")).toBeTruthy());
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockClear();
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));
  });

  expect(screen.queryByTestId("photo-camera")).toBeNull();
  await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1));
});

test("should not open the album over another screen when the note is left first", async () => {
  server(jest.fn());
  await openPhotoDoor();
  await waitFor(() => expect(screen.getByTestId("photo-camera")).toBeTruthy());
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockClear();

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Choose from library" }));
  });
  // Gone before the album had its moment.
  await act(async () => {
    router.back();
  });
  const leftAt = Date.now();
  await waitFor(() => expect(Date.now() - leftAt).toBeGreaterThan(700));

  expect(ImagePicker.launchImageLibraryAsync).not.toHaveBeenCalled();
});

test("should say so and stay on the camera when a picture fails to come through", async () => {
  const readPhoto = jest.fn();
  server(readPhoto);
  mockTakePicture.mockRejectedValueOnce(new Error("capture failed"));
  await openPhotoDoor();
  await waitFor(() => expect(screen.getByTestId("photo-camera")).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: "Take photo" }));
  });

  expect(screen.getByText("That photo didn't come through. Try again.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Take photo" })).toBeTruthy();
  expect(readPhoto).not.toHaveBeenCalled();
});
