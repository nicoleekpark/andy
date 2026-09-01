import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
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
      autoCreated: false,
      ...overrides,
    },
    notes: [],
    mentionedIn: [],
    mentionedInTotal: 0,
  };
}

function mockProfileMutations(handlers: {
  update?: jest.Mock;
  remove?: jest.Mock;
}) {
  (useMutation as jest.Mock).mockImplementation((reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "profiles:updateProfile" && handlers.update !== undefined) {
      return handlers.update;
    }
    if (name === "profiles:remove" && handlers.remove !== undefined) {
      return handlers.remove;
    }
    return jest.fn(async () => undefined);
  });
}

function mockUpdateProfile(updateProfile: jest.Mock) {
  mockProfileMutations({ update: updateProfile });
}

/**
 * `Alert.alert` guards the delete. Spied so a test can press the exact button
 * it means to — and so "Cancel deletes nothing" can be asserted at all, which
 * is the half of a confirmation that matters. Returns the spy so the message
 * itself can be read: what it counts is the difference between deleting an
 * empty row and deleting four years of notes.
 */
function mockDeleteAlert(press: "Delete" | "Cancel") {
  return jest
    .spyOn(Alert, "alert")
    .mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === press)?.onPress?.();
    });
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

  test("should count what is about to be lost before deleting", async () => {
    (useQuery as jest.Mock).mockReturnValue({
      ...profile({ name: "지선" }),
      notes: [
        { note: { _id: "note-1", createdAt: 0, text: "one", source: "voice" }, mentions: [] },
        { note: { _id: "note-2", createdAt: 0, text: "two", source: "voice" }, mentions: [] },
      ],
    });
    const remove = jest.fn(async () => ({
      removedNoteCount: 2,
      removedAutoCreatedCount: 0,
    }));
    mockProfileMutations({ remove });
    const alert = mockDeleteAlert("Delete");

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this person" }));
    });

    // "Delete 지선?" reads the same for an empty row and for years of notes,
    // and those are not the same decision.
    expect(alert.mock.calls[0]?.[0]).toBe("Delete 지선?");
    const body = alert.mock.calls[0]?.[1] ?? "";
    expect(body).toContain("2 notes go with them");
    // Both rules, because each one surprises somebody: what follows them out,
    // and what deliberately does not.
    expect(body).toContain("only ever came up inside those notes goes too");
    expect(body).toContain("that note keeps the name");
    expect(body).toContain("cannot be undone");
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ profileId: "contact-1" }));
    // Home, not back: back is this person's profile, which is gone.
    await waitFor(() => expect(result.getPathname()).toBe("/"));
  });

  test("should delete nothing when the confirmation is dismissed", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile());
    const remove = jest.fn(async () => ({
      removedNoteCount: 0,
      removedAutoCreatedCount: 0,
    }));
    mockProfileMutations({ remove });
    mockDeleteAlert("Cancel");

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this person" }));
    });

    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  test("should stay put and say why when deleting fails", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile());
    mockProfileMutations({
      remove: jest.fn(async () => {
        throw new Error("Andy couldn't find that person.");
      }),
    });
    mockDeleteAlert("Delete");

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this person" }));
    });

    await waitFor(() =>
      expect(screen.getByText("Andy couldn't find that person.")).toBeTruthy(),
    );
  });
});
