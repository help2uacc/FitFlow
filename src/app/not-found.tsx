import Link from "next/link";
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div><h1 className="text-2xl font-extrabold">صفحه پیدا نشد</h1><Link href="/dashboard" className="mt-4 inline-block text-brand-700 underline">بازگشت به داشبورد</Link></div>
    </main>
  );
}
