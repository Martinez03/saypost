import type { ReactNode } from "react";
import Link from "next/link";
import { BellRing, CheckCheck, Mic } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Dict } from "@/i18n";

// The sign-up and log-in frame: the form centred, and on wide screens three lines on what Dilo does.

export function AuthShell({ children, t }: { children: ReactNode; t: Dict }) {
  const perks = [
    { icon: <Mic className="size-4" />, title: t.landing.features.items[0].title, text: t.landing.features.items[0].text },
    { icon: <BellRing className="size-4" />, title: t.landing.features.items[1].title, text: t.landing.features.items[1].text },
    { icon: <CheckCheck className="size-4" />, title: t.landing.features.items[4].title, text: t.landing.features.items[4].text },
  ];
  return (
    <main className="grid flex-1 bg-background lg:grid-cols-2">
      <div className="flex flex-col px-4 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t.auth.backHome}>
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground">{t.auth.terms}</p>
      </div>
      <aside className="relative isolate hidden flex-col justify-center gap-8 overflow-hidden border-l bg-canvas p-12 lg:flex" aria-hidden>
        <div className="pointer-events-none absolute -top-32 -right-40 -z-10 size-[30rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand-bright)_16%,transparent),transparent)]" />
        <p className="max-w-sm text-2xl leading-snug font-semibold tracking-[-0.02em]">{t.landing.hero.title}</p>
        <ul className="grid max-w-sm gap-5">
          {perks.map((p) => (
            <li key={p.title} className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card text-primary shadow-xs">{p.icon}</span>
              <span className="grid gap-0.5">
                <span className="text-sm font-semibold">{p.title}</span>
                <span className="text-[0.8125rem] text-muted-foreground">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}
