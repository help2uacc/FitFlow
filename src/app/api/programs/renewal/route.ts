import { authed } from "@/server/api";
import { renewalStatus } from "@/domain/adjust/service";

export const GET = authed(({ db, user }) => ({ status: renewalStatus(db, user.id) }));
