import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useMutation, useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";

/**
 * src/app/(app)/profile/[id]/edit.tsx — correcting the person rather than a
 * note about them.
 *
 * `profiles.name` is both what every screen displays and what
 * `notes.saveCapture` matches the next capture against, so these tests are
 * about what reaches the mutation, not about the form rendering. The measured
 * case behind the screen is a business card read as `JOE KING`: until it could
 * be renamed, the next card for the same person would not have matched it.
 */
function profile(overrides: Record<string, unknown> = {}) {
  return {
    profile: {
      _id: "contact-1",
      _creationTime: 0,
      userId: "user-1",
      name: "JOE KING",
      entityType: "person",
      tags: ["cleaning"],
      isStub: false,
      ...overrides,
    },
    notes: [],
    mentionedIn: [],
    mentionedInTotal: 0,
  };
}

function mockUpdateProfile(updateProfile: jest.Mock) {
  (useMutation as jest.Mock).mockImplementation((reference: unknown) =>
    getFunctionName(reference as never) === "profiles:updateProfile"
      ? updateProfile
      : jest.fn(async () => undefined),
  );
}

type Args = {
  profileId: string;
  name: string;
  entityType: "person" | "animal";
  relationshipContext: string;
  firstMetDate: string;
  tags: string[];
};

describe("edit profile screen", () => {
  test("should send every field, not only the one that was touched", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile());
    const updateProfile = jest.fn(async (_args: Args) => null);
    mockUpdateProfile(updateProfile);

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Name"), "Joe King");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    const [args] = updateProfile.mock.calls[0] ?? [];
    expect(args?.name).toBe("Joe King");
    // A patch carrying only the edited field would blank the rest, and the
    // first keystroke is exactly where that hides.
    expect(args?.tags).toEqual(["cleaning"]);
    expect(args?.entityType).toBe("person");
  });

  test("should send the kind the user picked", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile({ name: "콩이" }));
    const updateProfile = jest.fn(async (_args: Args) => null);
    mockUpdateProfile(updateProfile);

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "animal" }));
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0]?.[0].entityType).toBe("animal");
  });

  test("should let a tag be added, since extraction is otherwise the only source of one", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile());
    const updateProfile = jest.fn(async (_args: Args) => null);
    mockUpdateProfile(updateProfile);

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Add a tag" }));
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Tag 2"), "professional");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0]?.[0].tags).toEqual([
      "cleaning",
      "professional",
    ]);
  });

  test("should show the mutation's own words when a rename clashes", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile());
    mockUpdateProfile(
      jest.fn(async () => {
        throw new Error("You already have someone called 민호.");
      }),
    );

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    // The message names the person it clashed with, which is the whole reason
    // it is worth showing rather than replacing with a generic failure.
    await waitFor(() =>
      expect(screen.getByText("You already have someone called 민호.")).toBeTruthy(),
    );
    // Still on the form, with the edit intact rather than thrown away.
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  test("should return to the profile once the change is saved", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile());
    mockUpdateProfile(jest.fn(async (_args: Args) => null));

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;
    await act(async () => {
      router.push("/profile/contact-1/edit");
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    await waitFor(() => expect(result.getPathname()).toBe("/profile/contact-1"));
  });

  test("should offer the way in from the profile itself", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile());

    const result = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await result;

    // A screen nothing links to is a screen nobody finds.
    expect(screen.getByRole("button", { name: "Edit this person" })).toBeTruthy();
  });
});
