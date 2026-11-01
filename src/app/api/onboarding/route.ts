import { authed } from "@/server/api";
import { getOnboardingState } from "@/domain/profile/service";

export const GET = authed(({ db, user }) => getOnboardingState(db, user.id));
