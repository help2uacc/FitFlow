import { authed } from "@/server/api";
import { AppError } from "@/lib/errors";
import { isValidISODate, todayISO } from "@/lib/dates";
import { listPhotos, MAX_PHOTO_BYTES, savePhoto } from "@/domain/progress/photos";

export const GET = authed(({ db, user }) => ({ items: listPhotos(db, user.id).map(({ fileName: _f, ...p }) => p) }));

export const POST = authed(async ({ req, db, user }) => {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_PHOTO_BYTES + 64 * 1024) throw new AppError("too_large", "حجم تصویر حداکثر ۸ مگابایت است.", 413);
  let form: FormData;
  try { form = await req.formData(); } catch { throw new AppError("bad_form", "فرم نامعتبر است."); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("no_file", "فایلی انتخاب نشده است.");
  const date = String(form.get("date") ?? todayISO(user.timezone));
  if (!isValidISODate(date)) throw new AppError("bad_date", "تاریخ نامعتبر است.");
  const pose = form.get("pose");
  const p = await savePhoto(db, user.id, { mime: file.type, data: Buffer.from(await file.arrayBuffer()), date, pose: typeof pose === "string" ? pose.slice(0, 30) : null });
  const { fileName: _f, ...rest } = p;
  return rest;
});
