import { z } from "zod";
import { authed, body } from "@/server/api";
import { decideDraft } from "@/domain/adjust/service";

const Body = z.object({ domain: z.enum(["workout", "nutrition"]), accept: z.boolean() });
export const POST = authed<{ id: string }>(async ({ req, db, user, params }) => {
  const b = await body(req, Body);
  decideDraft(db, user.id, b.domain, params.id, b.accept);
  return { ok: true };
});
