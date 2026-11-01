import { authed, body } from "@/server/api";
import { UpdateEntryInput, deleteEntry, updateEntry } from "@/domain/tracking/food";

export const PATCH = authed<{ id: string }>(async ({ req, db, user, params }) => {
  updateEntry(db, user.id, params.id, await body(req, UpdateEntryInput));
  return { ok: true };
});
export const DELETE = authed<{ id: string }>(({ db, user, params }) => {
  deleteEntry(db, user.id, params.id);
  return { ok: true };
});
