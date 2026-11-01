import { authed } from "@/server/api";
import { jobView } from "@/domain/ai/jobs";
import { requestInitialProgram } from "@/domain/program/service";

export const POST = authed(({ db, user }) => {
  const { job, duplicate } = requestInitialProgram(db, user.id);
  return { job: jobView(job), duplicate };
});
