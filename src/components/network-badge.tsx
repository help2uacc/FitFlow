"use client";
import { useEffect, useState } from "react";
import { outboxCount } from "@/lib/offline";

/** Shows offline state and number of locally queued (unsynced) logs. */
export function NetworkBadge() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const update = () => { setOnline(navigator.onLine); void outboxCount().then(setPending).catch(() => {}); };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("ff-outbox", update);
    const t = setInterval(update, 10000);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); window.removeEventListener("ff-outbox", update); clearInterval(t); };
  }, []);
  if (online && !pending) return null;
  return (
    <span className={online ? "rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" : "rounded-full bg-slate-200 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"}>
      {online ? `${pending.toLocaleString("fa-IR")} ثبت در انتظار همگام‌سازی` : "آفلاین"}
    </span>
  );
}
