/**
 * Turning whatever the image picker says about a file into a header a server
 * will accept.
 *
 * `ImagePicker.Asset.mimeType` is documented as a MIME type and is not always
 * one. On iOS it can come back as the system's *uniform type identifier* —
 * `public.jpeg` rather than `image/jpeg` — which is not a valid value for a
 * `Content-Type` header at all, and is rejected before it reaches any handler:
 *
 *     POST <convex upload url>   Content-Type: image/jpeg    200
 *     POST <convex upload url>   Content-Type: public.jpeg   400
 *     {"code":"BadHeader","message":"Bad header for content-type: invalid HTTP header"}
 *
 * Measured against the deployment, because the first two guesses at this 400
 * — an empty body, a reused upload URL — were both wrong and both cost a round
 * trip through somebody else's afternoon.
 *
 * The value matters after the upload as well: Convex stores it, hands it back
 * on the file's URL, and an `<Image>` given the wrong one has nothing to draw.
 */

/** `type/subtype`, the shape a header value has to have. */
const MIME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+\/[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
  heif: "image/heif",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * What to send as `Content-Type` for a picked image.
 *
 * The picker's own answer when it is usable, the file extension when it is
 * not, and `image/jpeg` when neither says anything — which is what the picker
 * produces here anyway, since every path through this app crops before
 * uploading and a crop comes back as JPEG.
 */
export function imageContentType(
  mimeType: string | undefined,
  uri: string,
): string {
  if (mimeType !== undefined && MIME.test(mimeType)) return mimeType;

  const path = uri.split(/[?#]/)[0] ?? "";
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return BY_EXTENSION[extension] ?? "image/jpeg";
}
