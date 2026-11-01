"use client";
import { useEffect } from "react";
import { saveSnapshot } from "@/lib/offline";

/** Stores the current plan & today's data on this device for offline viewing (IndexedDB, never the SW cache). */
export function DashboardSnapshot({ data }: { data: unknown }) {
  useEffect(() => {
    void saveSnapshot("dashboard", data);
  }, [data]);
  return null;
}
