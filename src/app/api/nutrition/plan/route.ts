import { authed } from "@/server/api";
import { requestNutritionPlan } from "@/domain/program/service";
import { jobView } from "@/domain/ai/jobs";

export const POST = authed(({ db, user }) => {
  const { job, duplicate } = requestNutritionPlan(db, user.id);
  return { job: jobView(job), duplicate };
});
