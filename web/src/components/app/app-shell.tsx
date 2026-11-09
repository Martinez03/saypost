"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCheck, Home, Link2, LogOut, Menu, MessageCircle, Newspaper, Settings, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { useI18n } from "@/components/i18n-provider";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// App frame: a sidebar on the grey canvas and the page on a white panel.
// On phones the sidebar becomes a sheet behind a menu button.

type NavKey = "home" | "approvals" | "posts" | "accounts" | "whatsapp" | "settings";

const NAV: { key: NavKey; href: string; icon: LucideIcon }[] = [
  { key: "home", href: "/app", icon: Home },
  { key: "approvals", href: "/app/approvals", icon: CheckCheck },
  { key: "posts", href: "/app/posts", icon: Newspaper },
  { key: "accounts", href: "/app/accounts", icon: Link2 },
  { key: "whatsapp", href: "/app/whatsapp", icon: MessageCircle },
  { key: "settings", href: "/app/settings", icon: Settings },
];

const navRowClass =
  "relative flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-lg px-3 text-left text-[0.8125rem] font-medium text-sidebar-foreground transition-colors outline-none hover:bg-foreground/[0.045] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/[0.06]";
const activeClass = "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:hover:bg-sidebar-accent";

type ShellProps = { businessName: string; email: string | null; pending: number };

function SidebarBody({ businessName, email, pending, onNavigate }: ShellProps & { onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const signOutForm = `signout-${onNavigate ? "sheet" : "side"}`;
  const initial = (email ?? businessName ?? "?").slice(0, 1).toUpperCase();

  return (
    <>
      <div className="grid gap-0.5 px-3 pt-1 pb-2">
        <Link href="/app" onClick={onNavigate} className="w-fit rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>
        <p className="truncate text-xs text-muted-foreground" title={businessName}>
          {businessName}
        </p>
      </div>

      <nav aria-label={t.common.menu} className="-mx-2.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5">
        {NAV.map(({ key, href, icon: Icon }) => {
          const active = href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={key} href={href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(navRowClass, active && activeClass)}>
              <Icon className={cn("size-4 shrink-0", active ? "text-primary dark:text-primary-ink" : "opacity-85")} aria-hidden />
              <span className="truncate">{t.nav[key]}</span>
              {key === "approvals" && pending > 0 && (
                <span className="num ml-auto rounded-full bg-primary px-1.5 text-[0.6875rem] leading-[1.125rem] font-semibold text-primary-foreground">
                  {pending > 99 ? "99+" : pending}
                  <span className="sr-only"> ({t.nav.pending(pending)})</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="grid shrink-0 gap-2 border-t pt-2.5">
        <div className="flex items-center gap-2 px-1">
          <LangToggle />
          <ThemeToggle side="top" />
        </div>
        <form id={signOutForm} action="/auth/signout" method="post" className="hidden" />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex h-11 min-w-0 items-center gap-2.5 overflow-hidden rounded-lg px-1.5 text-left outline-none transition-colors hover:bg-foreground/[0.045] focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground/[0.045] dark:hover:bg-white/[0.06]"
            aria-label={t.common.account}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-ink" aria-hidden>
              {initial}
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{email ?? t.common.account}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-60" side="top" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                const form = document.getElementById(signOutForm);
                if (form instanceof HTMLFormElement) form.requestSubmit();
              }}
            >
              <LogOut aria-hidden /> {t.common.signOut}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

export function AppShell({ children, ...props }: ShellProps & { children: ReactNode }) {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div data-app-shell className="flex min-h-svh flex-1 bg-canvas">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">
        {t.common.skipToContent}
      </a>
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-3 overflow-hidden px-2.5 py-3 md:flex">
        <SidebarBody {...props} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:py-2 md:pr-2">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-2.5 backdrop-blur-md md:hidden">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger
              className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t.common.openMenu}
            >
              <Menu className="size-5" aria-hidden />
              {props.pending > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" aria-hidden />}
            </SheetTrigger>
            <SheetContent side="left" className="w-[18rem] gap-3 overflow-hidden bg-canvas px-2.5 py-3">
              <SheetTitle className="sr-only">{t.common.menu}</SheetTitle>
              <SidebarBody {...props} onNavigate={() => setSheetOpen(false)} />
            </SheetContent>
          </Sheet>
          <Link href="/app" className="rounded-md">
            <Logo />
          </Link>
        </header>
        <main id="main" className="flex-1 bg-background md:rounded-xl md:border md:shadow-xs">
          <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12 sm:px-6 lg:px-8 lg:pt-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
