import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { I18nProvider } from "@/components/i18n-provider";
import { InlineScript } from "@/components/inline-script";
import { Toaster } from "@/components/ui/sonner";
import { getI18n } from "@/i18n/server";
import { HEAD_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100"),
    title: { default: t.meta.title, template: "%s · Saypost" },
    description: t.meta.description,
    openGraph: { title: t.meta.title, description: t.meta.description, siteName: "Saypost", type: "website" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121614" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang } = await getI18n();
  return (
    <html lang={lang} className={`${inter.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <InlineScript html={HEAD_SCRIPT} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <I18nProvider lang={lang}>
          {children}
          <Toaster position="top-center" />
        </I18nProvider>
      </body>
    </html>
  );
}
