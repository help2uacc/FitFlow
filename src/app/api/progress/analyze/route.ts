import { authed } from "@/server/api";
import { enqueueJob, jobView } from "@/domain/ai/jobs";

export const POST = authed(({ db, user }) => {
  const { job, duplicate } = enqueueJob(db, { userId: user.id, type: "analyze_progress", payload: {}, dedupeKey: "analyze_progress" });
  return { job: jobView(job), duplicate };
});
