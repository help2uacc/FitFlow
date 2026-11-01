import { authed } from "@/server/api";
import { getJob, jobView } from "@/domain/ai/jobs";

export const GET = authed<{ id: string }>(({ db, user, params }) => jobView(getJob(db, user.id, params.id)));
