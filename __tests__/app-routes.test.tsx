import { screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";
import { api } from "@convex/_generated/api";

/**
 * The route tree in src/app is deliberately made of placeholder screens with
 * no logic to test. What is worth catching here is that the route tree
 * resolves correctly: a typo in a directory name, a wrong dynamic-segment
 * filename, or a missing default export would make one of these routes
 * silently not exist, and nothing else in this project would catch that.
 *
 * These tests assert resolved pathname/segments, never placeholder copy.
 */

/**
 * Routed by function name because the capture screen asks two queries: who the
 * note is scoped to, and which names in the draft more than one person answers
 * to. One blanket `mockReturnValue` hands the second a profile where it expects
 * a list of questions.
 */
function mockCaptureQueries(scoped: unknown) {
  (useQuery as jest.Mock).mockImplementation((reference: unknown) =>
    getFunctionName(reference as never) === "profiles:candidatesFor"
      ? []
      : scoped,
  );
}

describe("app route tree", () => {
  test.each([
    ["/", "/"],
    ["/search", "/search"],
    ["/settings", "/settings"],
    ["/profile/contact-1", "/profile/contact-1"],
    ["/profile/contact-1/capture", "/profile/contact-1/capture"],
    ["/capture", "/capture"],
  ])("should resolve %s to a real screen", async (initialUrl, expectedPathname) => {
    const result = renderRouter("src/app", { initialUrl });
    await result;

    expect(result.getPathname()).toBe(expectedPathname);
  });

  test("should pass the id from the url through to the profile query", async () => {
    // The profile screen no longer prints the raw id — a real screen shows a
    // person, not a database key. The property still worth pinning is the same
    // one: the dynamic segment reaches the code that uses it, which is now the
    // query rather than the rendered text.
    const result = renderRouter("src/app", { initialUrl: "/profile/contact-42" });
    await result;

    expect(useQuery).toHaveBeenCalledWith(api.profiles.withNotes, {
      profileId: "contact-42",
    });
  });

  test("should resolve /profile/[id]/capture as a route distinct from /profile/[id]", async () => {
    const profile = renderRouter("src/app", { initialUrl: "/profile/contact-1" });
    await profile;
    expect(profile.getSegments()).toEqual(["(app)", "profile", "[id]"]);

    const capture = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await capture;
    expect(capture.getSegments()).toEqual(["(app)", "profile", "[id]", "capture"]);
  });

  test("should resolve /capture as a route distinct from /profile/[id]/capture, both rendering the capture screen", async () => {
    const unscoped = renderRouter("src/app", { initialUrl: "/capture" });
    await unscoped;
    expect(unscoped.getSegments()).toEqual(["(app)", "capture"]);
    // The shared capture screen's idle copy — proof this is the real screen,
    // not an empty placeholder route.
    expect(
      screen.getByText("Tap record and say what you want to remember."),
    ).toBeTruthy();

    // The scoped door has to say who it is scoped *to*, or the two routes are
    // indistinguishable to the person standing in front of them — which is how
    // a note recorded on 지선's page ended up asking who it was about.
    mockCaptureQueries({
      profile: { _id: "contact-1", name: "지선", entityType: "person", tags: [], isStub: false },
      notes: [],
      mentionedIn: [],
      mentionedInTotal: 0,
    });
    const scoped = renderRouter("src/app", { initialUrl: "/profile/contact-1/capture" });
    await scoped;
    expect(scoped.getSegments()).toEqual(["(app)", "profile", "[id]", "capture"]);
    expect(
      screen.getByText("Tap record. This note goes to 지선, whoever else comes up."),
    ).toBeTruthy();
  });
});
