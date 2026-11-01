/**
 * Small accessible UI primitives (Tailwind). RTL-first, large tap targets,
 * light/dark aware. Kept dependency-free on purpose.
 */
import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-brand-600/50",
  secondary: "bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800",
  ghost: "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
  danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-600/50",
  soft: "bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-900/40 dark:text-brand-200 dark:hover:bg-brand-900/60",
};
const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-13 px-6 text-base" };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes; loading?: boolean; block?: boolean };
export function Button({ variant = "primary", size = "md", loading, block, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx("inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed", variants[variant], sizes[size], block && "w-full", className)}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "primary", size = "md", block, className, children }: { href: string; variant?: keyof typeof variants; size?: keyof typeof sizes; block?: boolean; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx("inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors", variants[variant], sizes[size], block && "w-full", className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children, as: As = "section" }: { className?: string; children: ReactNode; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800", className)}>{children}</As>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: "slate" | "brand" | "amber" | "rose" | "sky"; className?: string }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    brand: "bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200",
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    rose: "bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
    sky: "bg-sky-50 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function ProgressBar({ value, max, tone = "brand", label }: { value: number; max: number; tone?: "brand" | "amber" | "rose" | "sky"; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const colors = { brand: "bg-brand-500", amber: "bg-amber-500", rose: "bg-rose-500", sky: "bg-sky-500" };
  return (
    <div role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-label={label} className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className={cx("h-full rounded-full transition-all", colors[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="num mt-1 text-lg font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
      <div className="font-semibold">{title}</div>
      {children && <div className="text-sm text-slate-500 dark:text-slate-400">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", className ?? "size-5")} />;
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "success"; title?: string; children?: ReactNode }) {
  const t = {
    info: "bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-100 dark:ring-sky-900",
    warn: "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900",
    error: "bg-rose-50 text-rose-900 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-900",
    success: "bg-brand-50 text-brand-900 ring-brand-200 dark:bg-brand-950/40 dark:text-brand-100 dark:ring-brand-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl p-3 text-sm ring-1", t)}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

const fieldCls = "w-full rounded-xl bg-white px-3 py-2.5 text-[15px] ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none dark:bg-slate-900 dark:ring-slate-700";
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldCls, "h-11", props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(fieldCls, "min-h-24", props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldCls, "h-11", props.className)} />;
}
export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {back && <Link href={back} className="mb-1 inline-block text-sm text-brand-700 dark:text-brand-300">→ بازگشت</Link>}
        <h1 className="truncate text-xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Persian digits & number formatting. */
export const faNum = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: digits });
export const faDate = (iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) =>
  new Intl.DateTimeFormat("fa-IR", { ...opts, timeZone: "UTC" }).format(new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso));
export const faDateTime = (ms: number) => new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
