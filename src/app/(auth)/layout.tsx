export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-10 dark:from-slate-900 dark:to-slate-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl font-extrabold text-brand-700 dark:text-brand-300">FitFlow</div>
          <p className="mt-1 text-sm text-slate-500">مربی هوشمند و شخصی تمرین و تغذیه</p>
        </div>
        {children}
      </div>
    </main>
  );
}
