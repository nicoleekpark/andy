/**
 * A camera frame made small enough to be read.
 *
 * A full 12MP frame's base64 is several times Convex's 1MB argument limit
 * (`MAX_IMAGE_CHARS`, `convex/extractionPrompt.ts`), and a page of notes needs
 * nowhere near that many pixels for its words to be legible. The album path
 * crops in iOS's picker instead; a photo from Andy's own camera has no crop
 * step, so it is shrunk here.
 *
 * Its own module so the native manipulator is only loaded when a picture is
 * actually taken — a build without it never reaches this.
 */

/** The longer side, in pixels: legible handwriting, well under the limit. */
export const READING_LONG_SIDE = 2000;
/** JPEG quality: small enough to fit, sharp enough for small print. */
const READING_QUALITY = 0.6;

export async function shrinkForReading(
  uri: string,
  width: number,
  height: number,
): Promise<{ uri: string; base64: string }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ImageManipulator, SaveFormat } = require("expo-image-manipulator") as typeof import("expo-image-manipulator");
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > READING_LONG_SIDE) {
    context.resize(width >= height ? { width: READING_LONG_SIDE } : { height: READING_LONG_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ base64: true, compress: READING_QUALITY, format: SaveFormat.JPEG });
  if (!saved.base64) throw new Error("No image data");
  return { uri: saved.uri, base64: saved.base64 };
}
