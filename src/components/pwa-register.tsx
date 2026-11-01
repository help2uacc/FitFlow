"use client";
import { useEffect } from "react";
import { startSyncLoop } from "@/lib/offline";

/** Registers the service worker and starts the offline outbox sync loop. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    return startSyncLoop();
  }, []);
  return null;
}
