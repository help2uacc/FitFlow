/** Private, optional, deletable progress photos stored outside the public dir. */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/db/client";
import * as t from "@/db/schema";
import { storagePath } from "@/lib/env";
import { AppError, notFound } from "@/lib/errors";
import { newId } from "@/lib/ids";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, { ext: string; check: (b: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { ext: "webp", check: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
};

const photoPath = (userId: string, fileName: string) => storagePath("photos", userId, path.basename(fileName));

export async function savePhoto(db: DB, userId: string, input: { mime: string; data: Buffer; date: string; pose?: string | null }) {
  const type = TYPES[input.mime];
  if (!type) throw new AppError("bad_type", "فقط تصاویر JPEG، PNG یا WebP مجاز است.");
  if (input.data.length > MAX_PHOTO_BYTES) throw new AppError("too_large", "حجم تصویر حداکثر ۸ مگابایت است.", 413);
  if (input.data.length < 16 || !type.check(input.data)) throw new AppError("bad_file", "فایل تصویر معتبر نیست.");
  const id = newId();
  const fileName = `${id}.${type.ext}`;
  await mkdir(storagePath("photos", userId), { recursive: true, mode: 0o700 });
  await writeFile(photoPath(userId, fileName), input.data, { mode: 0o600 });
  db.insert(t.progressPhotos).values({ id, userId, date: input.date, fileName, mimeType: input.mime, sizeBytes: input.data.length, pose: input.pose ?? null }).run();
  return db.select().from(t.progressPhotos).where(eq(t.progressPhotos.id, id)).get()!;
}

export function listPhotos(db: DB, userId: string) {
  return db.select().from(t.progressPhotos).where(eq(t.progressPhotos.userId, userId)).orderBy(desc(t.progressPhotos.date), desc(t.progressPhotos.createdAt)).all();
}

function ownPhoto(db: DB, userId: string, id: string) {
  const p = db.select().from(t.progressPhotos).where(and(eq(t.progressPhotos.id, id), eq(t.progressPhotos.userId, userId))).get();
  if (!p) throw notFound("عکس");
  return p;
}

export async function readPhoto(db: DB, userId: string, id: string) {
  const p = ownPhoto(db, userId, id);
  return { photo: p, data: await readFile(photoPath(userId, p.fileName)) };
}

export async function deletePhoto(db: DB, userId: string, id: string) {
  const p = ownPhoto(db, userId, id);
  await unlink(photoPath(userId, p.fileName)).catch(() => {});
  db.delete(t.progressPhotos).where(eq(t.progressPhotos.id, id)).run();
}

export async function deleteAllPhotos(db: DB, userId: string) {
  for (const p of listPhotos(db, userId)) await unlink(photoPath(userId, p.fileName)).catch(() => {});
}
