import { imageContentType } from "../src/lib/media";

test("should keep a real MIME type the picker gave", () => {
  expect(imageContentType("image/png", "file:///x.jpg")).toBe("image/png");
});

test("should not send a uniform type identifier as a header value", () => {
  // The bug, exactly. iOS hands back `public.jpeg`, which is not a MIME type;
  // Convex answers `400 BadHeader: invalid HTTP header` and the photo never
  // uploads. Verified against the deployment.
  expect(imageContentType("public.jpeg", "file:///IMG_0001.jpeg")).toBe(
    "image/jpeg",
  );
  expect(imageContentType("public.png", "file:///IMG_0002.PNG")).toBe(
    "image/png",
  );
});

test("should read the extension when the picker says nothing", () => {
  expect(imageContentType(undefined, "file:///a/b/photo.HEIC")).toBe(
    "image/heic",
  );
});

test("should ignore a query string when reading the extension", () => {
  expect(imageContentType(undefined, "file:///photo.png?width=100")).toBe(
    "image/png",
  );
});

test("should fall back to jpeg when nothing says anything", () => {
  // Every path through this app crops before uploading, and a crop comes back
  // as JPEG — so this is the honest default rather than a shrug.
  expect(imageContentType(undefined, "file:///no-extension")).toBe("image/jpeg");
  expect(imageContentType("", "")).toBe("image/jpeg");
});
