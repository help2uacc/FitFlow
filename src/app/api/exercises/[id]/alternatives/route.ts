import { authed } from "@/server/api";
import { exerciseAlternatives } from "@/domain/adjust/service";

export const GET = authed<{ id: string }>(({ db, user, params }) => ({ items: exerciseAlternatives(db, user.id, decodeURIComponent(params.id)) }));
