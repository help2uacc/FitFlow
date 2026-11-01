"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cx } from "./ui";
import { NetworkBadge } from "./network-badge";

const NAV = [
  { href: "/dashboard", label: "خانه", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/workouts/today", label: "تمرین", icon: "M4 10h2v4H4zm14 0h2v4h-2zM6 8h2v8H6zm10 0h2v8h-2zM8 11h8v2H8z" },
  { href: "/nutrition/log", label: "تغذیه", icon: "M7 3v8a3 3 0 0 0 2 2.83V21h2v-7.17A3 3 0 0 0 13 11V3h-1.5v6h-1V3h-2v6h-1V3zm9 0c-1.66 0-3 2.24-3 5v5h2v8h2V3z" },
  { href: "/progress", label: "پیشرفت", icon: "M4 19h16v2H4zM6 10h3v7H6zm5-4h3v11h-3zm5 7h3v4h-3z" },
  { href: "/more", label: "بیشتر", icon: "M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4m7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4m7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4" },
];
const MORE = ["/more", "/profile", "/settings", "/coach", "/reports", "/exercises", "/program", "/check-in"];

export function AppShell({ children, userName, unread }: { children: React.ReactNode; userName: string; unread: number }) {
  const path = usePathname();
  const active = (href: string) => (href === "/more" ? MORE.some((p) => path.startsWith(p)) : path.startsWith(href) || (href === "/workouts/today" && path.startsWith("/workouts")) || (href === "/nutrition/log" && path.startsWith("/nutrition")));
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  const toggleTheme = () => {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    try { localStorage.setItem("ff-theme", d ? "dark" : "light"); } catch { /* ignore */ }
  };
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-l border-slate-200 bg-white p-4 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <Link href="/dashboard" className="mb-6 text-xl font-extrabold text-brand-700 dark:text-brand-300">FitFlow</Link>
        <nav className="flex flex-col gap-1">
          {[...NAV.slice(0, 4), { href: "/coach", label: "مربی هوشمند", icon: NAV[4].icon }, { href: "/program/workout", label: "برنامه‌ها", icon: NAV[1].icon }, { href: "/reports", label: "PDF گزارش‌ها", icon: NAV[3].icon }, { href: "/profile", label: "پروفایل", icon: NAV[0].icon }, { href: "/settings", label: "تنظیمات", icon: NAV[4].icon }].map((n) => (
            <Link key={n.href} href={n.href} className={cx("rounded-xl px-3 py-2.5 text-sm font-medium", path.startsWith(n.href) ? "bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")}>{n.label}</Link>
          ))}
        </nav>
        <div className="mt-auto text-xs text-slate-500">{userName}</div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-950/80">
          <Link href="/dashboard" className="text-lg font-extrabold text-brand-700 dark:text-brand-300">FitFlow</Link>
          <div className="flex items-center gap-1">
            <NetworkBadge />
            <button onClick={toggleTheme} suppressHydrationWarning aria-label="تغییر تم" className="grid size-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{dark ? "☀" : "☾"}</button>
            <Link href="/notifications" aria-label="اعلان‌ها" className="relative grid size-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
              <svg viewBox="0 0 24 24" className="size-5 fill-current"><path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2m6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 0 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1z" /></svg>
              {unread > 0 && <span className="absolute top-1.5 left-1.5 size-2.5 rounded-full bg-rose-500" />}
            </Link>
          </div>
        </div>
        <div className="hidden h-14 items-center justify-end gap-2 px-6 lg:flex">
          <NetworkBadge />
          <button suppressHydrationWarning onClick={toggleTheme} className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{dark ? "تم روشن" : "تم تیره"}</button>
          <Link href="/notifications" className="rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">اعلان‌ها{unread > 0 ? ` (${unread.toLocaleString("fa-IR")})` : ""}</Link>
        </div>
        <main className="mx-auto w-full max-w-3xl px-4 pt-4 pb-28 lg:px-6 lg:pb-10">{children}</main>
      </div>
      <nav aria-label="ناوبری اصلی" className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-950/95">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className={cx("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", active(n.href) ? "text-brand-700 dark:text-brand-300" : "text-slate-500 dark:text-slate-400")} aria-current={active(n.href) ? "page" : undefined}>
                <svg viewBox="0 0 24 24" className="size-6 fill-current"><path d={n.icon} /></svg>
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
