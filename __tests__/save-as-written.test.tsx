import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import { renderRouter } from "expo-router/testing-library";
import { api } from "@convex/_generated/api";
import type { CaptureDraft } from "../src/lib/capture-draft";
import { forgetOnThisPhone } from "../src/lib/on-phone";
import { answerByName, nameOf, quietCall } from "../test-support/convex-mocks";

/**
 * Save as written (`pre-submission-privacy.md`, option A, 2b): somebody who
 * said Not now still keeps notes — the person named at the top, the words as
 * written, nothing read. The same name rules as a note Andy read.
 */

const WRITE_BODY = /^Write (or paste )?what you want to remember/;

type Candidate = { profileId: string; name: string; relationshipContext?: string };

const PRIYA_PAGE = {
  profile: { _id: "profile-1", name: "Priya", entityType: "person", tags: [], autoCreated: false },
  photoUrl: null,
  notes: [],
  mentionedIn: [],
  mentionedInTotal: 0,
};

function server({
  choice = "declined",
  candidates = {},
  kept = [],
}: {
  choice?: "declined" | "unasked" | "allowed";
  candidates?: Record<string, Candidate[]>;
  kept?: { _id: string; name: string; aliases?: string[] }[];
} = {}) {
  (useQuery as jest.Mock).mockImplementation((reference: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    switch (nameOf(reference)) {
      case nameOf(api.featureFlags.switchedOff):
        return [];
      case nameOf(api.users.current):
        return {
          _id: "user-1",
          _creationTime: 1,
          tokenIdentifier: "t|alice",
          ...(choice === "declined" ? { aiDeclinedAt: 1 } : {}),
          ...(choice === "allowed" ? { aiAllowedAt: 1 } : {}),
        };
      case nameOf(api.profiles.resolveNames):
        return (args as { names: string[] }).names.map((name) => ({
          name,
          viaPossessive: false,
          candidates: (candidates[name] ?? []).map((one) => ({
            entityType: "person",
            noteCount: 1,
            lastNoteAt: new Date("2026-09-01T12:00:00").getTime(),
            ...one,
          })),
        }));
      case nameOf(api.profiles.withNotes):
        return PRIYA_PAGE;
      case nameOf(api.offline.snapshot):
        return {
          takenAt: 1,
          profiles: kept.map((one) => ({
            _creationTime: 1,
            userId: "user-1",
            entityType: "person",
            tags: [],
            autoCreated: false,
            ...one,
          })),
          notes: [],
          links: [],
        };
      case nameOf(api.people.search):
        return { people: [], mentions: [] };
      default:
        return undefined;
    }
  });
  const saveCapture = jest.fn(async () => ({
    profileId: "profile-new",
    noteId: "note-new",
    createdProfile: true,
    createdMentionCount: 0,
  }));
  const decline = jest.fn(async () => null);
  answerByName(
    useMutation,
    { [nameOf(api.notes.saveCapture)]: saveCapture, [nameOf(api.aiPermission.decline)]: decline },
    quietCall,
  );
  const extract = jest.fn(async () => ({
    primary: {
      name: "Jisoo Kim",
      entityType: "person",
      relationshipContext: null,
      tags: [],
      firstMetDate: null,
      keyFacts: [],
    },
    mentions: [],
  }));
  answerByName(useAction, { [nameOf(api.extraction.fromTranscript)]: extract }, quietCall);
  return { saveCapture, extract };
}

async function write(url: string, words: string) {
  const result = renderRouter("src/app", { initialUrl: url });
  await result;
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText(WRITE_BODY), words);
  });
  // Wrapped: an async function returning the result itself would await it away.
  return { getPathname: () => result.getPathname() };
}

async function typeAbout(name: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText("About"), name);
  });
}

async function press(name: string) {
  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name }));
  });
}

const files = () =>
  (jest.requireMock("expo-file-system") as { __files: Map<string, string> }).__files;
const DRAFT = "file:///documents/capture-draft/draft.json";
const keptDrafts = (): CaptureDraft[] => {
  const raw = files().get(DRAFT);
  return raw === undefined ? [] : (JSON.parse(raw) as CaptureDraft[]);
};

afterEach(() => {
  jest.restoreAllMocks();
  forgetOnThisPhone();
});

test("should offer Save as written to someone who said no, and wait for who it is about", async () => {
  server();
  await write("/capture?door=write", "Met at the design meetup.");

  expect(screen.getByText("Choose who it's about to save it as written.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save as written" })).toBeDisabled();
  // Reading is still there, one small tap away.
  expect(screen.getByRole("button", { name: "Let Andy read it" })).toBeTruthy();

  await typeAbout("Jisoo Kim");

  expect(screen.getByText("Andy won't read this. It's kept as you wrote it.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save as written" })).not.toBeDisabled();
});

test("should save a new person straight from Write, with nothing read", async () => {
  const { saveCapture, extract } = server();
  const page = await write("/capture?door=write", "Met at the design meetup.");
  await typeAbout("Jisoo Kim");

  await press("Save as written");

  expect(extract).not.toHaveBeenCalled();
  expect(saveCapture).toHaveBeenCalledWith(
    expect.objectContaining({
      transcript: "Met at the design meetup.",
      source: "manual",
      draft: {
        primary: {
          name: "Jisoo Kim",
          entityType: "person",
          relationshipContext: null,
          tags: [],
          firstMetDate: null,
          keyFacts: [],
        },
        mentions: [],
      },
      resolutions: [],
    }),
  );
  await waitFor(() => expect(page.getPathname()).toBe("/profile/profile-new"));
});

test("should file a note written on someone's page under them, without asking", async () => {
  const { saveCapture } = server({
    candidates: { Priya: [{ profileId: "profile-1", name: "Priya", relationshipContext: "friend" }] },
  });
  await write("/profile/profile-1/capture?door=write", "Glaze workshop on Nov 8.");

  // The page says who: no About field to fill.
  expect(screen.queryByLabelText("About")).toBeNull();
  await press("Save as written");

  expect(saveCapture).toHaveBeenCalledWith(
    expect.objectContaining({
      draft: expect.objectContaining({ primary: expect.objectContaining({ name: "Priya" }) }),
      resolutions: [{ name: "Priya", profileId: "profile-1" }],
    }),
  );
});

test("should ask which one when two people share the name, and save only once answered", async () => {
  const { saveCapture } = server({
    candidates: {
      Priya: [
        { profileId: "friend-priya", name: "Priya", relationshipContext: "friend" },
        { profileId: "colleague-priya", name: "Priya", relationshipContext: "colleague" },
      ],
    },
  });
  await write("/capture?door=write", "Her daughter starts kindergarten next week.");
  await typeAbout("Priya");

  await press("Save as written");

  // The same question a note Andy read gets — never a guess.
  expect(saveCapture).not.toHaveBeenCalled();
  expect(screen.getByText("Which Priya?")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remember this" })).toBeDisabled();

  await act(async () => {
    fireEvent.press(screen.getByRole("button", { name: /^Priya, colleague/ }));
  });
  await press("Remember this");

  expect(saveCapture).toHaveBeenCalledWith(
    expect.objectContaining({
      transcript: "Her daughter starts kindergarten next week.",
      resolutions: [{ name: "Priya", profileId: "colleague-priya" }],
    }),
  );
});

test("should suggest a kept name found in the words, and fill About only when tapped", async () => {
  server({ kept: [{ _id: "p1", name: "Priya" }, { _id: "p2", name: "May" }] });
  await write("/capture?door=write", "Priya's daughter starts kindergarten next week.");

  expect(screen.getByTestId("write-about-suggestions")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "About May" })).toBeNull();
  expect(screen.getByLabelText("About")).toHaveProp("value", "");

  await press("About Priya");

  expect(screen.getByLabelText("About")).toHaveProp("value", "Priya");
});

test("should keep Andy's reading the main way for someone who has not said no", async () => {
  server({ choice: "unasked" });
  await write("/capture?door=write", "Met at the design meetup.");

  expect(screen.queryByRole("button", { name: "Save as written" })).toBeNull();
  expect(screen.getByPlaceholderText("Who is this about? (optional)")).toBeTruthy();
});

test("should switch to Save as written the moment Not now is pressed", async () => {
  const { extract } = server({ choice: "unasked" });
  await write("/capture?door=write", "Met at the design meetup.");

  await press("Let Andy read it");
  await press("Not now");

  expect(extract).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save as written" })).toBeTruthy();
});

test("should take the name at the top along as a hint when Andy reads", async () => {
  const { extract } = server({ choice: "allowed" });
  await write("/capture?door=write", "Met at the design meetup.");
  await typeAbout("Jisoo Kim");

  await press("Let Andy read it");

  await waitFor(() =>
    expect(extract).toHaveBeenCalledWith(expect.objectContaining({ aboutName: "Jisoo Kim" })),
  );
});

test("should keep the name at the top with a half-written note, and bring it back", async () => {
  server();
  await write("/capture?door=write", "Met at the design meetup.");
  await typeAbout("Jisoo Kim");

  await waitFor(() => expect(keptDrafts()[0]?.aboutName).toBe("Jisoo Kim"));
  const id = keptDrafts()[0]?.id;

  renderRouter("src/app", { initialUrl: `/capture?resume=${id}` });
  await waitFor(() => expect(screen.getByLabelText("About")).toHaveProp("value", "Jisoo Kim"));
});
