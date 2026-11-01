import Link from "next/link";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "بیشتر" };

const LINKS: [string, string, string][] = [
  ["/coach", "مربی هوشمند", "درخواست تغییر به زبان ساده"],
  ["/program/adjust", "تنظیم برنامه", "سختی، روزها، کالری"],
  ["/program/renew", "تمدید / دوره جدید", "برنامه دوره بعد"],
  ["/program/workout", "برنامه تمرینی", "جلسات هفتگی"],
  ["/program/nutrition", "برنامه غذایی", "منو و فهرست خرید"],
  ["/program/history", "تاریخچه برنامه‌ها", "نسخه‌ها و تغییرات"],
  ["/workouts/history", "تاریخچه تمرین", "جلسات ثبت‌شده"],
  ["/check-in", "چک‌این هفتگی", "چند سؤال کوتاه"],
  ["/exercises", "کتابخانه حرکات", "راهنما و تصاویر"],
  ["/reports", "گزارش‌های PDF", "دانلود برنامه و پیشرفت"],
  ["/notifications", "اعلان‌ها", "یادآوری‌ها و پیام‌ها"],
  ["/profile", "پروفایل", "اطلاعات و ترجیحات"],
  ["/settings", "تنظیمات", "اعلان، امنیت، داده‌ها"],
  ["/settings/ai", "وضعیت هوش مصنوعی", "Codex و سرویس پس‌زمینه"],
];

export default function Page() {
  return (
    <>
      <PageHeader title="بیشتر" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {LINKS.map(([href, title, desc]) => (
          <Link key={href} href={href} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 hover:ring-brand-300 dark:bg-slate-900 dark:ring-slate-800">
            <div className="font-bold">{title}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{desc}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
