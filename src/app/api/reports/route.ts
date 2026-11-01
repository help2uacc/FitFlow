import { z } from "zod";
import { authed, body } from "@/server/api";
import { listReports, requestReport } from "@/domain/pdf/export";

export const GET = authed(({ db, user }) => ({ items: listReports(db, user.id).map(({ fileName: _f, ...r }) => r) }));

export const POST = authed(async ({ req, db, user }) => {
  const i = await body(req, z.object({ kind: z.enum(["workout", "nutrition", "combined", "progress"]), range: z.enum(["7", "14", "30", "90", "all"]).optional() }));
  const { fileName: _f, ...r } = requestReport(db, user.id, i.kind, { range: i.range });
  return r;
});
