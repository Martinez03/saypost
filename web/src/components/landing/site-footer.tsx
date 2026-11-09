import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Dict } from "@/i18n";

export function SiteFooter({ t, githubUrl, licenseUrl, guideUrl }: { t: Dict; githubUrl: string; licenseUrl: string; guideUrl: string }) {
  const f = t.landing.footer;
  const links = [
    { href: githubUrl, label: f.github, external: true },
    { href: guideUrl, label: f.guide, external: true },
    { href: licenseUrl, label: f.license, external: true },
    { href: "/login", label: f.demo, external: false },
  ];
  return (
    <footer className="border-t">
      <div className="mx-auto grid w-full max-w-[78rem] gap-8 px-5 pt-10 pb-8 sm:px-8 md:grid-cols-[1fr_auto] lg:px-12">
        <div className="grid content-start gap-3">
          <Logo />
          <p className="text-muted-foreground">{f.tagline}</p>
          <p>
            <a href="https://zernio.com" target="_blank" rel="noopener noreferrer" className="font-medium text-primary-ink underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
              {f.built}
            </a>
          </p>
        </div>
        <div className="grid content-start gap-5 md:justify-items-end">
          <nav aria-label="Dilo" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {links.map((l) =>
              l.external ? (
                <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} href={l.href} className="hover:text-foreground">
                  {l.label}
                </Link>
              ),
            )}
          </nav>
          <div className="flex items-center gap-2">
            <LangToggle />
            <ThemeToggle side="top" />
          </div>
        </div>
        <p className="text-xs text-subtle-foreground md:col-span-2">{f.disclaimer}</p>
      </div>
    </footer>
  );
}
