"use client";
import { useEffect } from "react";
import { saveSnapshot } from "@/lib/offline";

/** Stores the active plan on this device (IndexedDB) for offline viewing. */
export function PlanSnapshot({ snapshotKey = "workout_plan", data }: { snapshotKey?: string; data: unknown }) {
  useEffect(() => {
    void saveSnapshot(snapshotKey, data);
  }, [snapshotKey, data]);
  return null;
}
