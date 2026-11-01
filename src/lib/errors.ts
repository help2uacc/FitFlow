export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = "مورد") => new AppError("not_found", `${what} پیدا نشد.`, 404);
export const forbidden = () => new AppError("forbidden", "دسترسی مجاز نیست.", 403);
export const conflict = (msg: string) => new AppError("conflict", msg, 409);
