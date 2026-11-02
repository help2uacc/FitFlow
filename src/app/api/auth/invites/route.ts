import { createInvite } from "@/domain/auth/service";
import { authed } from "@/server/api";
import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

export const POST = authed(({ db, user }) => {
  if (user.role !== "owner") throw new AppError("forbidden", "فقط مالک می‌تواند دعوت ایجاد کند.", 403);
  const { token, expiresAt } = createInvite(db, user.id);
  return { url: `${env().APP_URL}/register?invite=${token}`, expiresAt };
});
