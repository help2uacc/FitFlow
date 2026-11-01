import { authed } from "@/server/api";
import { getPlanReview, getProfile, profileEditorModel } from "@/domain/profile/service";
import { computeTargets } from "@/domain/nutrition/calc";

export const GET = authed(({ db, user }) => {
  const profile = getProfile(db, user.id);
  return { profile, questions: profileEditorModel(db, user.id), planReview: getPlanReview(db, user.id), estimates: computeTargets(profile) };
});
