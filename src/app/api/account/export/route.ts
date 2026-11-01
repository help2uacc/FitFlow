import { authed } from "@/server/api";
import { exportUserData } from "@/domain/account/service";
import { todayISO } from "@/lib/dates";

export const GET = authed(({ db, user }) => {
  const data = exportUserData(db, user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="fitflow-export-${todayISO(user.timezone)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
});
