import { renderRouter, screen } from "expo-router/testing-library";

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

  test("should expose the id from the url to useLocalSearchParams when navigating to /profile/[id]", async () => {
    const result = renderRouter("src/app", { initialUrl: "/profile/contact-42" });
    await result;

    expect(screen.getByText(/contact-42/)).toBeTruthy();
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
