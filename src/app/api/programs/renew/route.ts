import { authed, body } from "@/server/api";
import { RenewInput, requestNextCycle } from "@/domain/adjust/service";

export const POST = authed(async ({ req, db, user }) => requestNextCycle(db, user.id, await body(req, RenewInput)));
