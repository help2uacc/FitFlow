"use client";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-[60dvh] place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-extrabold">مشکلی پیش آمد</h1>
        <p className="mt-2 text-sm text-slate-500">اطلاعات شما حفظ شده است. دوباره تلاش کنید.</p>
        <button onClick={reset} className="mt-4 rounded-xl bg-brand-600 px-4 py-2 text-white">تلاش دوباره</button>
      </div>
    </main>
  );
}
