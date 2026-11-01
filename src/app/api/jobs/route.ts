import { authed } from "@/server/api";
import { activeJobs, jobView } from "@/domain/ai/jobs";

export const GET = authed(({ db, user }) => ({ jobs: activeJobs(db, user.id).map(jobView) }));
