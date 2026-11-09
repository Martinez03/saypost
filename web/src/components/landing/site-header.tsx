import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { GithubButton } from "@/components/landing/github-button";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Dict } from "@/i18n";

export function SiteHeader({ t, stars, githubUrl, locale }: { t: Dict; stars: number | null; githubUrl: string; locale: string }) {
  const n = t.landing.nav;
  const links = [
    { href: "#agencias", label: n.agencies },
    { href: "#como-funciona", label: n.how },
    { href: "#que-hace", label: n.does },
    { href: "#seguridad", label: n.safety },
    { href: "#instalar", label: n.selfHost },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[78rem] items-center gap-3 px-5 sm:px-8 lg:px-12">
        <Link href="/" className="rounded-lg" aria-label="Saypost">
          <Logo />
        </Link>
        <nav aria-label={t.common.menu} className="ml-6 hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
          <Link href="/login" className="rounded-md px-1 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground sm:px-2">
            {n.login}
          </Link>
          <LangToggle />
          <ThemeToggle className="hidden sm:flex" />
          <GithubButton href={githubUrl} label={n.github} stars={stars} starsLabel={n.stars} locale={locale} labelClassName="max-sm:sr-only" />
        </div>
      </div>
    </header>
  );
}
