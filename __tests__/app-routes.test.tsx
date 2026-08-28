import { renderRouter } from "expo-router/testing-library";
import { useQuery } from "convex/react";
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

describe("app route tree", () => {
  test.each([
    ["/", "/"],
    ["/search", "/search"],
    ["/settings", "/settings"],
    ["/profile/contact-1", "/profile/contact-1"],
    ["/profile/contact-1/capture", "/profile/contact-1/capture"],
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
});
