"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Alert, Button } from "@/components/ui";

export function DraftDecision({ versionId, domain }: { versionId: string; domain: "workout" | "nutrition" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "accept" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const decide = async (accept: boolean) => {
    setBusy(accept ? "accept" : "reject");
    try {
      await api(`/api/programs/versions/${versionId}/decision`, { body: { domain, accept } });
      router.push(accept ? (domain === "workout" ? "/program/workout" : "/program/nutrition") : "/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطا");
      setBusy(null);
    }
  };
  return (
    <div className="safe-bottom sticky bottom-16 z-10 space-y-2 bg-slate-50/90 py-3 backdrop-blur lg:bottom-0 dark:bg-slate-950/90">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button className="flex-1" size="lg" onClick={() => decide(true)} loading={busy === "accept"} disabled={!!busy}>تأیید و فعال‌سازی</Button>
        <Button variant="secondary" size="lg" onClick={() => decide(false)} loading={busy === "reject"} disabled={!!busy}>رد</Button>
      </div>
    </div>
  );
}

export function RestoreVersion({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <Button variant="soft" loading={busy} onClick={async () => {
        if (!confirm("این نسخه به‌عنوان نسخه جدید فعال شود؟ تاریخچه حفظ می‌شود.")) return;
        setBusy(true);
        try { await api(`/api/programs/versions/${versionId}/restore`, { method: "POST" }); router.push("/program/workout"); router.refresh(); }
        catch (e) { setError(e instanceof ApiError ? e.message : "خطا"); setBusy(false); }
      }}>اعمال دوباره این نسخه</Button>
    </div>
  );
}
