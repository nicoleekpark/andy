import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { useMutation, useQuery } from "convex/react";

import { router } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import { answerByName, given, nameOf, quietCall } from "../test-support/convex-mocks";
import { ConvexError } from "convex/values";
import { scrollsAboveKeyboard } from "../test-support/keyboard";
import { answerDialog } from "../test-support/dialog";

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
  answerByName(
    useMutation,
    given({ "profiles:updateProfile": handlers.update, "profiles:remove": handlers.remove }),
    quietCall,
  );
}

function mockUpdateProfile(updateProfile: jest.Mock) {
  mockProfileMutations({ update: updateProfile });
}


type Args = {
  profileId: string;
  name: string;
  entityType: "person" | "animal";
  relationshipContext: string;
  firstMetDate: string;
  tags: string[];
  aliases: string[];
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
    // The keyboard must not cover the last fields with no way to scroll to them.
    expect(scrollsAboveKeyboard("Name")).toBe(true);

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

  test("should offer no Person / Animal choice, and leave an animal an animal on save", async () => {
    // V1 keeps people only, but a profile saved as an animal before that must
    // not be quietly turned into a person by an unrelated edit.
    (useQuery as jest.Mock).mockReturnValue(
      profile({ name: "Biscuit", entityType: "animal" }),
    );
    const updateProfile = jest.fn(async (_args: Args) => null);
    mockUpdateProfile(updateProfile);

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    expect(screen.queryByText("Who or what")).toBeNull();
    expect(screen.queryByRole("button", { name: "animal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "person" })).toBeNull();

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
    // Only the line just added takes focus; the one already there does not.
    expect(screen.getByLabelText("Tag 2").props.autoFocus).toBe(true);
    expect(screen.getByLabelText("Tag 1").props.autoFocus).toBe(false);
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
        throw new ConvexError("You already have someone called Marcus.");
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
      expect(screen.getByText("You already have someone called Marcus.")).toBeTruthy(),
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
      ...profile({ name: "Emma" }),
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

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this person" }));
    });

    // "Delete Emma?" reads the same for an empty row and for years of notes,
    // and those are not the same decision.
    const dialog = within(screen.getByTestId("confirm-dialog"));
    expect(dialog.getByText("Delete Emma?")).toBeTruthy();
    const body = dialog.getByText(/notes go with them/).props.children as string;
    expect(body).toContain("2 notes go with them");
    // Both rules, because each one surprises somebody: what follows them out,
    // and what deliberately does not.
    expect(body).toContain("only ever came up inside those notes goes too");
    expect(body).toContain("that note keeps the name");
    expect(body).toContain("cannot be undone");
    expect(remove).not.toHaveBeenCalled();
    await answerDialog("Delete");
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ profileId: "contact-1" }));
    // Home, not back: back is this person's profile, which is gone.
    await waitFor(() => expect(result.getPathname()).toBe("/"));
  });

  // The way it is actually reached: home → profile → edit. Replacing only the
  // edit screen with home left the deleted person's profile under it, so home
  // showed "< Emma" as its back button — a way back to somebody who is gone.
  // Found on the simulator on 2026-09-30.
  test("should leave no way back to the person once they are deleted", async () => {
    const withNotes = profile({ name: "Emma" });
    answerByName(useQuery, { [nameOf(api.profiles.withNotes)]: withNotes });
    mockProfileMutations({
      remove: jest.fn(async () => ({ removedNoteCount: 0, removedAutoCreatedCount: 0 })),
    });

    const result = renderRouter("src/app", { initialUrl: "/" });
    await result;
    await act(async () => {
      router.push("/profile/contact-1");
    });
    await act(async () => {
      router.push("/profile/contact-1/edit");
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this person" }));
    });
    await answerDialog("Delete");

    await waitFor(() => expect(result.getPathname()).toBe("/"));
    expect(router.canGoBack()).toBe(false);
  });

  test("should delete nothing when the confirmation is dismissed", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile());
    const remove = jest.fn(async () => ({
      removedNoteCount: 0,
      removedAutoCreatedCount: 0,
    }));
    mockProfileMutations({ remove });

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this person" }));
    });
    await answerDialog("Cancel");

    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  test("should stay put and say why when deleting fails", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile());
    mockProfileMutations({
      remove: jest.fn(async () => {
        throw new ConvexError("Andy couldn't find that person.");
      }),
    });

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Delete this person" }));
    });
    await answerDialog("Delete");

    await waitFor(() =>
      expect(screen.getByText("Andy couldn't find that person.")).toBeTruthy(),
    );
  });

  test("should let another name be added, and send it with the rest", async () => {
    (useQuery as jest.Mock).mockReturnValue(profile({ name: "Emma" }));
    const updateProfile = jest.fn(async (_args: Args) => null);
    mockUpdateProfile(updateProfile);

    const result = renderRouter("src/app", {
      initialUrl: "/profile/contact-1/edit",
    });
    await result;

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Add another name" }));
    });
    // The new line opens with the keyboard up, rather than waiting for a
    // second tap on a blank field.
    expect(screen.getByLabelText("Other name 1").props.autoFocus).toBe(true);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText("Other name 1"), "Em");
    });
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
    });

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile.mock.calls[0]?.[0].aliases).toEqual(["Em"]);
    // Everything else still goes with it, the way every other field does.
    expect(updateProfile.mock.calls[0]?.[0].tags).toEqual(["cleaning"]);
  });
});
