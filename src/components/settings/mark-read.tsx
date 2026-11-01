"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function MarkAllRead({ unread }: { unread: number }) {
  const router = useRouter();
  useEffect(() => {
    if (unread > 0) api("/api/notifications/read-all", { method: "POST" }).then(() => router.refresh()).catch(() => {});
  }, [unread, router]);
  return null;
}
