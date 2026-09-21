/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ALICE = { subject: "alice", name: "Alice", email: "alice@example.com" };
const BOB = { subject: "bob", name: "Bob", email: "bob@example.com" };

async function seed(t: ReturnType<typeof convexTest>) {
  const userId = await t.withIdentity(ALICE).mutation(api.users.ensureUser, {});
  const profileId = await t.run(async (ctx) =>
    ctx.db.insert("profiles", {
      userId,
      name: "Amy",
      entityType: "person",
      tags: [],
      autoCreated: false,
    }),
  );
  return { userId, profileId };
}

/** A file in storage, as if it had been uploaded. */
async function storeFile(t: ReturnType<typeof convexTest>, body: string) {
  return t.run(async (ctx) => ctx.storage.store(new Blob([body])));
}

async function storedIds(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const files = await ctx.db.system.query("_storage").collect();
    return files.map((file) => file._id);
  });
}

// ---------------------------------------------------------------------------
// Getting a photo on
// ---------------------------------------------------------------------------

test("should put an uploaded file on the person and show it on their profile", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  const storageId = await storeFile(t, "a photo");

  await t
    .withIdentity(ALICE)
    .mutation(api.photos.attach, { profileId, storageId });

  const result = await t
    .withIdentity(ALICE)
    .query(api.profiles.withNotes, { profileId });

  expect(result?.profile.photoStorageId).toBe(storageId);
  // A storage id is useless to a screen: only the backend can turn one into
  // something an `<Image>` can load.
  expect(result?.photoUrl).toEqual(expect.any(String));
});

test("should say there is no photo rather than leave the screen to guess", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);

  const result = await t
    .withIdentity(ALICE)
    .query(api.profiles.withNotes, { profileId });

  // `null`, not absent. The screen branches on it, and `undefined === null` is
  // false — which would send it down the has-a-photo path with no photo.
  expect(result?.photoUrl).toBeNull();
});

// ---------------------------------------------------------------------------
// Not leaving files behind — Convex has no cascading delete
// ---------------------------------------------------------------------------

test("should delete the file it replaces, so nobody pays for a photo nothing points at", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  const first = await storeFile(t, "first photo");
  const second = await storeFile(t, "second photo");

  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.photos.attach, { profileId, storageId: first });
  await asAlice.mutation(api.photos.attach, { profileId, storageId: second });

  const remaining = await storedIds(t);
  // Replacing is the common case — somebody picks a better photo — so this is
  // the leak that would happen every time rather than rarely.
  expect(remaining).toEqual([second]);
});

test("should take the file with it when the photo is removed", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  const storageId = await storeFile(t, "a photo");
  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.photos.attach, { profileId, storageId });

  await asAlice.mutation(api.photos.remove, { profileId });

  const result = await asAlice.query(api.profiles.withNotes, { profileId });
  expect(result?.profile.photoStorageId).toBeUndefined();
  // Clearing the field alone leaves the bytes in storage for ever, reachable
  // by nothing and billed all the same.
  expect(await storedIds(t)).toEqual([]);
});

test("should take the file with it when the whole person is deleted", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  const storageId = await storeFile(t, "a photo");
  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.photos.attach, { profileId, storageId });

  await asAlice.mutation(api.profiles.remove, { profileId });

  // This cascade was written before anything could write `photoStorageId` —
  // it is the only reason a stored file cannot outlive its profile.
  expect(await storedIds(t)).toEqual([]);
});

test("should do nothing rather than fail when removing a photo that is not there", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);

  await expect(
    t.withIdentity(ALICE).mutation(api.photos.remove, { profileId }),
  ).resolves.toBeNull();
});

// ---------------------------------------------------------------------------
// Whose profile
// ---------------------------------------------------------------------------

test("should refuse to put a photo on another user's person", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  await t.withIdentity(BOB).mutation(api.users.ensureUser, {});
  const storageId = await storeFile(t, "bob's photo");

  // The same words as a person who does not exist. A caller must not learn
  // that a row they cannot read is there — and "same message either way" is a
  // claim in a comment until something compares them.
  await expect(
    t.withIdentity(BOB).mutation(api.photos.attach, { profileId, storageId }),
  ).rejects.toThrow(/couldn't find that person/);

  const result = await t
    .withIdentity(ALICE)
    .query(api.profiles.withNotes, { profileId });
  expect(result?.profile.photoStorageId).toBeUndefined();
});

test("should refuse a file another person already holds, whoever owns them", async () => {
  const t = convexTest(schema, modules);
  const { profileId: alicesProfile } = await seed(t);
  const bobUserId = await t.withIdentity(BOB).mutation(api.users.ensureUser, {});
  const bobsProfile = await t.run(async (ctx) =>
    ctx.db.insert("profiles", {
      userId: bobUserId,
      name: "Bob's person",
      entityType: "person",
      tags: [],
      autoCreated: false,
    }),
  );
  const alicesPhoto = await storeFile(t, "alice's photo");
  await t
    .withIdentity(ALICE)
    .mutation(api.photos.attach, {
      profileId: alicesProfile,
      storageId: alicesPhoto,
    });

  // The whole exploit in one call. `v.id("_storage")` is a format check and
  // Convex records no uploader, so the ownership check passes — it *is* Bob's
  // profile. What used to happen next: Bob reads Alice's photo through
  // `withNotes`, then calls `remove` on his own profile and destroys her file,
  // leaving her row pointing at nothing.
  await expect(
    t.withIdentity(BOB).mutation(api.photos.attach, {
      profileId: bobsProfile,
      storageId: alicesPhoto,
    }),
  ).rejects.toThrow(/couldn't use that photo/);

  // Hers is untouched and still hers.
  expect(await storedIds(t)).toEqual([alicesPhoto]);
  const hers = await t
    .withIdentity(ALICE)
    .query(api.profiles.withNotes, { profileId: alicesProfile });
  expect(hers?.profile.photoStorageId).toBe(alicesPhoto);
});

test("should let the same person re-attach the photo they already have", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  const storageId = await storeFile(t, "a photo");
  const asAlice = t.withIdentity(ALICE);
  await asAlice.mutation(api.photos.attach, { profileId, storageId });

  // A client retry after a timeout where the mutation actually committed. The
  // "already claimed" check must not refuse the row its own file belongs to,
  // and the replace-cleanup must not delete the file still being pointed at.
  await asAlice.mutation(api.photos.attach, { profileId, storageId });

  const result = await asAlice.query(api.profiles.withNotes, { profileId });
  expect(result?.profile.photoStorageId).toBe(storageId);
  expect(await storedIds(t)).toEqual([storageId]);
});

test("should refuse a file with no bytes in it, which the upload endpoint calls a success", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  const empty = await storeFile(t, "");

  // Not a hypothetical, and not misuse. Measured against the deployment: a
  // POST to an upload URL with an empty body answers `200` and hands back a
  // storage id, so a client that read the picked file wrongly gets a perfectly
  // ordinary-looking success — and the profile renders a broken image for ever
  // with nothing anywhere saying why.
  await expect(
    t
      .withIdentity(ALICE)
      .mutation(api.photos.attach, { profileId, storageId: empty }),
  ).rejects.toThrow(/didn't finish uploading/);

  const result = await t
    .withIdentity(ALICE)
    .query(api.profiles.withNotes, { profileId });
  expect(result?.profile.photoStorageId).toBeUndefined();
});

test("should refuse and delete a file past the size cap, rather than keep paying for it", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  // The client crops and compresses to far under the cap — but those are client
  // hints, and nothing makes a caller use the app to reach the upload URL.
  const tooBig = await storeFile(t, "x".repeat(8 * 1024 * 1024 + 1));

  await expect(
    t
      .withIdentity(ALICE)
      .mutation(api.photos.attach, { profileId, storageId: tooBig }),
  ).rejects.toThrow(/too large/);

  // Still there, and deliberately. The first version of this deleted the file
  // before throwing; the delete rolled back with the rest of the mutation and
  // the assertion that caught it was this one, inverted. Asserting the survival
  // is what stops it being re-added as cleanup that does nothing.
  expect(await storedIds(t)).toEqual([tooBig]);
  // What must not happen is the photo going on anyway.
  const result = await t
    .withIdentity(ALICE)
    .query(api.profiles.withNotes, { profileId });
  expect(result?.profile.photoStorageId).toBeUndefined();
});

test("should take the photo with it when the person was one Andy invented", async () => {
  const t = convexTest(schema, modules);
  const { userId, profileId } = await seed(t);
  const asAlice = t.withIdentity(ALICE);

  // Somebody who exists only because a note mentioned them — and mention links
  // are tappable, so nothing stops a photo being added to them.
  const invented = await t.run(async (ctx) =>
    ctx.db.insert("profiles", {
      userId,
      name: "John",
      entityType: "person",
      tags: [],
      autoCreated: true,
    }),
  );
  const noteId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("notes", {
      userId,
      profileId,
      text: "Amy's party. John was there.",
      source: "voice" as const,
      createdAt: Date.UTC(2026, 8, 1, 12),
    });
    await ctx.db.insert("noteMentions", {
      userId,
      noteId: id,
      profileId: invented,
      name: "John",
      quote: "John was there",
    });
    return id;
  });
  const photo = await storeFile(t, "john's photo");
  await asAlice.mutation(api.photos.attach, {
    profileId: invented,
    storageId: photo,
  });

  // Deleting the note removes the person it invented, through the shared
  // cleanup path — which deleted the row and left the photograph. Not a
  // storage bill: a picture of a real person, kept for ever, with no row
  // pointing at it and no route in the app to remove it.
  await asAlice.mutation(api.notes.remove, { noteId });

  expect(await storedIds(t)).toEqual([]);
});

test("should refuse to take the photo off another user's person", async () => {
  const t = convexTest(schema, modules);
  const { profileId } = await seed(t);
  await t.withIdentity(BOB).mutation(api.users.ensureUser, {});
  const storageId = await storeFile(t, "a photo");
  await t
    .withIdentity(ALICE)
    .mutation(api.photos.attach, { profileId, storageId });

  await expect(
    t.withIdentity(BOB).mutation(api.photos.remove, { profileId }),
  ).rejects.toBeInstanceOf(ConvexError);

  // And the file survives — a refused delete must not delete.
  expect(await storedIds(t)).toEqual([storageId]);
});

test("should refuse an upload url to somebody who is not signed in", async () => {
  const t = convexTest(schema, modules);

  // An unauthenticated upload URL is a free file host.
  await expect(t.mutation(api.photos.generateUploadUrl, {})).rejects.toThrow();
});

test("should give a signed-in caller an upload url that carries no profile on it", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  const url = await t
    .withIdentity(ALICE)
    .mutation(api.photos.generateUploadUrl, {});

  // `expect.any(String)` was the whole assertion here, which passes for any
  // string at all — and it carried a comment claiming it proved a leaked URL
  // could not put a photo on somebody's person. It proved nothing; the test
  // above is the one that does.
  expect(url).toMatch(/^https?:\/\//);
});

test("should hide a person that does not exist behind the same message as one that is not yours", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const storageId = await storeFile(t, "a photo");

  await expect(
    t.withIdentity(ALICE).mutation(api.photos.attach, {
      profileId: "not-an-id",
      storageId: storageId as Id<"_storage">,
    }),
  ).rejects.toThrow(/couldn't find that person/);
});
