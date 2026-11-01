import { authed } from "@/server/api";
import { jobView, retryJob } from "@/domain/ai/jobs";

export const POST = authed<{ id: string }>(({ db, user, params }) => jobView(retryJob(db, user.id, params.id)));
