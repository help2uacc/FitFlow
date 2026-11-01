"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { clearOfflineData } from "@/lib/offline";
import { Alert, Button, Card, CardHeader, Field, Input, cx, faDateTime } from "@/components/ui";

export function ThemePanel() {
  const [mode, setMode] = useState<"light" | "dark" | "system">("system");
  useEffect(() => {
    const id = setTimeout(() => { try { const t = localStorage.getItem("ff-theme"); setMode(t === "dark" || t === "light" ? t : "system"); } catch { /* ignore */ } }, 0);
    return () => clearTimeout(id);
  }, []);
  const apply = (m: typeof mode) => {
    setMode(m);
    try { if (m === "system") localStorage.removeItem("ff-theme"); else localStorage.setItem("ff-theme", m); } catch { /* ignore */ }
    const dark = m === "dark" || (m === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  };
  return (
    <Card>
      <CardHeader title="ظاهر" />
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="radiogroup" aria-label="تم">
        {([["light", "روشن"], ["dark", "تیره"], ["system", "مطابق سیستم"]] as const).map(([v, l]) => (
          <button key={v} role="radio" aria-checked={mode === v} onClick={() => apply(v)} className={cx("h-10 rounded-lg text-sm font-medium", mode === v ? "bg-white shadow-sm dark:bg-slate-900" : "text-slate-600 dark:text-slate-300")}>{l}</button>
        ))}
      </div>
    </Card>
  );
}

interface Prefs { workoutReminders: boolean; workoutTime: string; checkinReminders: boolean; mealReminders: boolean; programReminders: boolean }
const b64ToUint8 = (b64: string) => { const p = "=".repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-slate-500">{hint}</span>}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-brand-600" />
    </label>
  );
}

export function NotificationsPanel() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [pushServer, setPushServer] = useState(false);
  const [perm, setPerm] = useState<string>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  useEffect(() => {
    api<{ prefs: Prefs; pushConfigured: boolean }>("/api/notifications/prefs").then((r) => { setPrefs(r.prefs); setPushServer(r.pushConfigured); }).catch(() => {});
    if ("Notification" in window) void Promise.resolve(Notification.permission).then(setPerm);
    navigator.serviceWorker?.getRegistration().then((reg) => reg?.pushManager?.getSubscription()).then((s) => setSubscribed(!!s)).catch(() => {});
  }, []);
  const save = async (p: Prefs) => {
    setPrefs(p);
    try { await api("/api/notifications/prefs", { method: "PUT", body: p }); setMsg({ tone: "success", text: "ذخیره شد." }); } catch (e) { setMsg({ tone: "error", text: (e as Error).message }); }
  };
  const enablePush = async () => {
    setMsg(null);
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) throw new Error("مرورگر شما از اعلان پشتیبانی نمی‌کند. روی iOS ابتدا برنامه را به صفحه اصلی اضافه کنید.");
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") throw new Error("اجازه اعلان داده نشد.");
      const { publicKey } = await api<{ publicKey: string | null }>("/api/push/key");
      if (!publicKey) { setMsg({ tone: "info", text: "اعلان‌های پوش روی سرور پیکربندی نشده‌اند (کلیدهای VAPID). اعلان‌ها در داخل برنامه نمایش داده می‌شوند." }); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) });
      const j = sub.toJSON();
      await api("/api/push/subscribe", { body: { endpoint: j.endpoint, keys: j.keys } });
      setSubscribed(true);
      setMsg({ tone: "success", text: "اعلان‌های این دستگاه فعال شد." });
    } catch (e) { setMsg({ tone: "error", text: (e as Error).message }); }
  };
  const disablePush = async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await api("/api/push/subscribe", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
    setSubscribed(false);
  };
  return (
    <Card>
      <div id="notifications" />
      <CardHeader title="اعلان‌ها و یادآوری‌ها" subtitle="متن اعلان‌ها کلی است و جزئیات سلامتی روی صفحه قفل نمایش داده نمی‌شود." />
      {prefs ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <div>
            <Toggle checked={prefs.workoutReminders} onChange={(v) => save({ ...prefs, workoutReminders: v })} label="یادآوری تمرین" hint="در روزهای تمرین، اگر هنوز ثبت نکرده باشید" />
            {prefs.workoutReminders && <div className="pb-2"><Input type="time" value={prefs.workoutTime} onChange={(e) => e.target.value && save({ ...prefs, workoutTime: e.target.value })} aria-label="ساعت یادآوری تمرین" className="w-36" /></div>}
          </div>
          <Toggle checked={prefs.checkinReminders} onChange={(v) => save({ ...prefs, checkinReminders: v })} label="یادآوری چک‌این هفتگی" />
          <Toggle checked={prefs.programReminders} onChange={(v) => save({ ...prefs, programReminders: v })} label="پایان دوره و آماده شدن برنامه جدید" />
          <Toggle checked={prefs.mealReminders} onChange={(v) => save({ ...prefs, mealReminders: v })} label="یادآوری وعده‌های غذایی" />
          <div className="pt-3">
            <div className="mb-2 text-sm">اعلان روی این دستگاه: {subscribed ? "فعال" : perm === "denied" ? "مسدود در مرورگر" : "غیرفعال"}</div>
            {!pushServer && <p className="mb-2 text-xs text-slate-500">ارسال پوش روی سرور پیکربندی نشده؛ اعلان‌ها فقط داخل برنامه دیده می‌شوند.</p>}
            {subscribed ? <Button size="sm" variant="secondary" onClick={disablePush}>غیرفعال کردن روی این دستگاه</Button> : <Button size="sm" variant="soft" onClick={enablePush} disabled={perm === "denied"}>فعال‌سازی اعلان روی این دستگاه</Button>}
          </div>
        </div>
      ) : <p className="text-sm text-slate-500">در حال بارگذاری…</p>}
      {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
    </Card>
  );
}

export function PasswordPanel() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (next !== confirmPw) { setMsg({ tone: "error", text: "تکرار رمز جدید مطابقت ندارد." }); return; }
    setBusy(true);
    try { await api("/api/auth/password", { body: { current, next } }); setMsg({ tone: "success", text: "رمز عبور تغییر کرد." }); setCurrent(""); setNext(""); setConfirmPw(""); }
    catch (err) { setMsg({ tone: "error", text: (err as Error).message }); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader title="تغییر رمز عبور" />
      <form onSubmit={submit} className="space-y-3">
        <Field label="رمز فعلی" htmlFor="pw-cur"><Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></Field>
        <Field label="رمز جدید" htmlFor="pw-new" hint="حداقل ۱۰ کاراکتر، شامل حروف و عدد"><Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} /></Field>
        <Field label="تکرار رمز جدید" htmlFor="pw-conf"><Input id="pw-conf" type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required /></Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" loading={busy}>ذخیره رمز جدید</Button>
      </form>
    </Card>
  );
}

interface SessionRow { id: string; current: boolean; userAgent: string | null; createdAt: number; lastSeenAt: number }
const deviceName = (ua: string | null) => {
  if (!ua) return "دستگاه نامشخص";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "مرورگر";
  return `${br}${os ? ` روی ${os}` : ""}`;
};

export function SessionsPanel() {
  const [items, setItems] = useState<SessionRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => { try { const r = await api<{ sessions: SessionRow[] } | SessionRow[]>("/api/auth/sessions"); setItems(Array.isArray(r) ? r : r.sessions); } catch (e) { setErr((e as Error).message); } };
  useEffect(() => { api<{ sessions: SessionRow[] } | SessionRow[]>("/api/auth/sessions").then((r) => setItems(Array.isArray(r) ? r : r.sessions)).catch((e) => setErr((e as Error).message)); }, []);
  const revoke = async (id: string) => { await api(`/api/auth/sessions/${id}`, { method: "DELETE" }); await load(); };
  const revokeOthers = async () => { await api("/api/auth/sessions", { method: "DELETE" }); await load(); };
  return (
    <Card>
      <CardHeader title="نشست‌های فعال" action={items && items.length > 1 ? <Button size="sm" variant="secondary" onClick={revokeOthers}>خروج از سایر دستگاه‌ها</Button> : undefined} />
      {err && <Alert tone="error">{err}</Alert>}
      {items ? (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2.5">
              <div>
                <div className="text-sm font-medium">{deviceName(s.userAgent)} {s.current && <span className="text-xs text-brand-700 dark:text-brand-300">(همین دستگاه)</span>}</div>
                <div className="text-xs text-slate-500">آخرین فعالیت: {faDateTime(s.lastSeenAt)}</div>
              </div>
              {!s.current && <Button size="sm" variant="ghost" onClick={() => revoke(s.id)}>خروج</Button>}
            </li>
          ))}
        </ul>
      ) : !err && <p className="text-sm text-slate-500">در حال بارگذاری…</p>}
    </Card>
  );
}

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    await clearOfflineData();
    try { sessionStorage.clear(); } catch { /* ignore */ }
    window.location.href = "/login";
  };
  return <Button variant="secondary" block onClick={logout} loading={busy}>خروج از حساب</Button>;
}

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export function InstallPanel() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      setStandalone(matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
      setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    }, 0);
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    window.addEventListener("beforeinstallprompt", h);
    return () => { clearTimeout(id); window.removeEventListener("beforeinstallprompt", h); };
  }, []);
  return (
    <Card>
      <CardHeader title="نصب برنامه روی گوشی" />
      {standalone ? <p className="text-sm text-brand-700 dark:text-brand-300">FitFlow به‌صورت برنامه نصب شده است.</p> : (
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {evt && <Button onClick={async () => { await evt.prompt(); setEvt(null); }}>نصب FitFlow</Button>}
          {ios ? <p>در Safari روی دکمه «اشتراک‌گذاری» بزنید و سپس «Add to Home Screen» را انتخاب کنید.</p>
            : !evt && <p>در Chrome یا Edge از منوی مرورگر گزینه «نصب برنامه» یا «Add to Home screen» را انتخاب کنید.</p>}
          <p className="text-xs text-slate-500">پس از نصب، برنامه فعلی و ثبت تمرین/غذا در حالت آفلاین هم در دسترس است.</p>
        </div>
      )}
    </Card>
  );
}

export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const del = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      await api("/api/account/delete", { body: { password, confirm: confirmText } });
      await clearOfflineData();
      window.location.href = "/register";
    } catch (er) { setErr((er as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card className="ring-rose-200 dark:ring-rose-900">
      <CardHeader title="داده‌های من" subtitle="خروجی کامل داده‌ها یا حذف دائمی حساب" />
      <div className="space-y-3">
        <a href="/api/account/export" className="inline-flex h-11 items-center rounded-xl bg-white px-4 text-sm font-medium ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700" download>دانلود همه داده‌ها (JSON)</a>
        {!open ? <div><Button variant="danger" size="sm" onClick={() => setOpen(true)}>حذف حساب و همه داده‌ها</Button></div> : (
          <form onSubmit={del} className="space-y-3 rounded-xl bg-rose-50 p-3 dark:bg-rose-950/30">
            <p className="text-sm text-rose-800 dark:text-rose-200">این کار برگشت‌ناپذیر است: پروفایل، برنامه‌ها، تمام ثبت‌ها، عکس‌ها و فایل‌های PDF حذف می‌شوند.</p>
            <Field label="رمز عبور" htmlFor="del-pw"><Input id="del-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <Field label="برای تأیید DELETE را تایپ کنید" htmlFor="del-c"><Input id="del-c" className="ltr" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
            {err && <Alert tone="error">{err}</Alert>}
            <div className="flex gap-2"><Button variant="danger" type="submit" loading={busy} disabled={confirmText !== "DELETE" || !password}>حذف دائمی</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>انصراف</Button></div>
          </form>
        )}
      </div>
    </Card>
  );
}
