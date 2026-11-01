import type { Metadata, Viewport } from "next";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/800.css";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: { default: "FitFlow — مربی هوشمند تمرین و تغذیه", template: "%s · FitFlow" },
  description: "برنامه تمرینی و غذایی شخصی با هوش مصنوعی",
  applicationName: "FitFlow",
  appleWebApp: { capable: true, title: "FitFlow", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#0b8a51" }, { media: "(prefers-color-scheme: dark)", color: "#020617" }],
};

// Applies the saved/OS theme before paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('ff-theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
