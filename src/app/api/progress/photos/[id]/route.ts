import { authed } from "@/server/api";
import { deletePhoto, readPhoto } from "@/domain/progress/photos";

export const GET = authed<{ id: string }>(async ({ db, user, params }) => {
  const { photo, data } = await readPhoto(db, user.id, params.id);
  return new Response(new Uint8Array(data), { headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});

export const DELETE = authed<{ id: string }>(async ({ db, user, params }) => {
  await deletePhoto(db, user.id, params.id);
  return { ok: true };
});
