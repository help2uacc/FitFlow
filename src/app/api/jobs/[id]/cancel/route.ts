import { authed } from "@/server/api";
import { cancelJob, jobView } from "@/domain/ai/jobs";

export const POST = authed<{ id: string }>(({ db, user, params }) => jobView(cancelJob(db, user.id, params.id)));
