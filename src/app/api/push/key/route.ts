import { authed } from "@/server/api";
import { env } from "@/lib/env";
import { pushConfigured } from "@/domain/notifications/scheduler";

export const GET = authed(() => ({ publicKey: pushConfigured() ? env().VAPID_PUBLIC_KEY ?? null : null }));
