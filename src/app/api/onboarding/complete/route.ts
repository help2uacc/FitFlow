import { authed } from "@/server/api";
import { completeOnboarding } from "@/domain/profile/service";

export const POST = authed(({ db, user }) => completeOnboarding(db, user.id));
