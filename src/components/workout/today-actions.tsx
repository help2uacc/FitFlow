"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, uid } from "@/lib/client";
import { submitOrQueue } from "@/lib/offline";
import { Alert, Button } from "@/components/ui";

/** Start / continue / mark-missed controls for today's session. */
export function TodayActions({ date, sessionId, existingId, existingStatus }: { date: string; sessionId: string | null; existingId: string | null; existingStatus: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const start = async (withSession: boolean) => {
    setBusy(withSession ? "start" : "free");
    setMsg(null);
    const payload = { clientId: uid("w"), date, sessionId: withSession ? sessionId : null, title: withSession ? undefined : "تمرین آزاد" };
    try {
      const r = await submitOrQueue({ type: "start_workout", payload }, () => api<{ id: string }>("/api/workouts", { body: payload }));
      if (r.queued) setMsg({ tone: "info", text: "آفلاین هستید؛ شروع جلسه ذخیره شد و پس از اتصال همگام می‌شود. برای ثبت ست‌ها، صفحه را آنلاین باز کنید." });
      else router.push(`/workouts/session/${r.data.id}`);
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const missed = async () => {
    if (!sessionId || !confirm("این جلسه به‌عنوان «از دست رفته» ثبت شود؟")) return;
    setBusy("miss");
    try {
      await api("/api/workouts/missed", { body: { sessionId, date, clientId: uid("m") } });
      router.refresh();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const open = existingId && (existingStatus === "in_progress" || existingStatus === "paused");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {sessionId && !existingId && <Button size="lg" onClick={() => start(true)} loading={busy === "start"}>شروع تمرین</Button>}
        {open && <Button size="lg" onClick={() => router.push(`/workouts/session/${existingId}`)}>ادامه تمرین</Button>}
        {existingId && !open && <Button variant="secondary" onClick={() => router.push(`/workouts/session/${existingId}`)}>مشاهده جلسه</Button>}
        <Button variant="secondary" onClick={() => start(false)} loading={busy === "free"}>ثبت تمرین خارج از برنامه</Button>
        {sessionId && !existingId && <Button variant="ghost" onClick={missed} loading={busy === "miss"}>انجام نشد</Button>}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
