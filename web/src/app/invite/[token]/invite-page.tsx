"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Link2Off, Loader2, LockKeyhole, Mic, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AgencyTile } from "@/components/app/agency-brand-fields";
import { Logo } from "@/components/brand/logo";
import { BRAND_NAMES, BrandLogo, type BrandId } from "@/components/brand-icons";
import { buttonVariants } from "@/components/ui/button";
import { getDict, LANG_NAMES, LANGS, type Lang } from "@/i18n";
import { storeLang } from "@/i18n/client";
import { ApiError, publicApi, type PublicInvite } from "@/lib/api";
import { cn } from "@/lib/utils";

type Platform = PublicInvite["platforms"][number];

/** The networks most local businesses use come first; the rest fold under "More networks". */
const MAIN = ["instagram", "facebook", "googlebusiness", "tiktok", "linkedin", "twitter"];
const brandId = (p: string): BrandId => (p === "twitter" ? "x" : (p as BrandId));
const nameOf = (p: string) => BRAND_NAMES[brandId(p)] ?? p;
const LANG_KEY = "saypost-invite-lang";

type State = { status: "loading" } | { status: "gone" } | { status: "error" } | { status: "ready"; invite: PublicInvite };

export function InvitePage({ token, cookieLang }: { token: string; cookieLang: Lang | null }) {
  const [state, setState] = useState<State>({ status: "loading" });
  // The business's language unless the visitor picks one here (kept for this tab, across the trip to the network).
  const [picked, setPicked] = useState<Lang | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const started = useRef(false);

  const invite = state.status === "ready" ? state.invite : null;
  const lang: Lang = picked ?? invite?.language ?? cookieLang ?? "es";
  const t = getDict(lang);
  const p = t.invitePage;
  const agency = invite?.brandName ?? null;
  const agencyWord = agency ?? p.fallbackAgency;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const load = useCallback(async () => {
    const base = `/public/invites/${encodeURIComponent(token)}`;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const failed = params.get("error");
    const failedPlatform = params.get("platform") ?? connected;
    const accountId = params.get("accountId");
    // Back from the network: clean the URL so a reload doesn't repeat the toast.
    if (params.size) window.history.replaceState(null, "", window.location.pathname);

    try {
      const data = await publicApi<PublicInvite>(base);
      const dict = getDict(readPickedLang() ?? data.language).invitePage;
      setState({ status: "ready", invite: data });
      if (data.platforms.some((x) => x.connected && !MAIN.includes(x.platform))) setMoreOpen(true);
      if (failed) {
        toast.error(dict.errorToast(failedPlatform ? nameOf(failedPlatform) : ""));
      } else if (connected) {
        setSyncing(true);
        try {
          const { platforms } = await publicApi<{ platforms: Platform[] }>(`${base}/sync`, { platform: connected, accountId });
          setState({ status: "ready", invite: { ...data, platforms } });
          if (platforms.some((x) => x.platform === connected && x.connected)) toast.success(dict.connectedToast(nameOf(connected)));
          if (!MAIN.includes(connected)) setMoreOpen(true);
        } catch {
          // The account.connected webhook will still save it; the next visit shows it.
        } finally {
          setSyncing(false);
        }
      }
    } catch (e) {
      setState({ status: e instanceof ApiError && e.status === 404 ? "gone" : "error" });
    }
  }, [token]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const saved = readPickedLang();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restores the visitor's choice after hydration
    if (saved) setPicked(saved);
    void load();
  }, [load]);

  function choose(next: Lang) {
    setPicked(next);
    storeLang(next);
    try {
      sessionStorage.setItem(LANG_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
  }

  async function connect(platform: string) {
    setConnecting(platform);
    try {
      const { authUrl } = await publicApi<{ authUrl: string }>(`/public/invites/${encodeURIComponent(token)}/connect`, { platform });
      // The network's own login (through Zernio); it comes back here with ?connected=<platform>.
      window.location.assign(authUrl);
    } catch (e) {
      setConnecting(null);
      if (e instanceof ApiError && e.status === 404) setState({ status: "gone" });
      else toast.error(p.errorToast(nameOf(platform)));
    }
  }

  const header = (
    <header className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
      {invite && agency ? (
        <span className="flex min-w-0 items-center gap-2.5">
          <AgencyTile name={agency} logoUrl={invite.logoUrl} className="size-9 rounded-lg" />
          <span className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em]">{agency}</span>
        </span>
      ) : (
        <Logo />
      )}
      <div role="group" aria-label={t.common.language} className="inline-flex h-8 shrink-0 items-center rounded-lg border bg-background p-0.5 text-xs font-medium shadow-xs">
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => choose(l)}
            aria-pressed={l === lang}
            title={LANG_NAMES[l]}
            lang={l}
            className={cn(
              "h-full rounded-md px-2 uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              l === lang ? "bg-primary-soft text-primary-ink" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l}
            <span className="sr-only"> ({LANG_NAMES[l]})</span>
          </button>
        ))}
      </div>
    </header>
  );

  if (state.status !== "ready") {
    return (
      <>
        {header}
        <main id="main" className="mx-auto grid w-full max-w-xl flex-1 content-start px-4 pt-10 pb-16 sm:px-6">
          {state.status === "loading" ? (
            <div className="grid gap-4" role="status" aria-label={t.common.loading}>
              <div className="h-4 w-32 animate-pulse rounded bg-foreground/10" />
              <div className="h-20 animate-pulse rounded-xl bg-foreground/10" />
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-32 animate-pulse rounded-2xl bg-foreground/[0.06]" />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid justify-items-start gap-3 rounded-2xl border bg-card p-6" data-invite-state={state.status}>
              <span className="flex size-10 items-center justify-center rounded-xl bg-canvas">
                <Link2Off className="size-5 text-muted-foreground" aria-hidden />
              </span>
              <h1 className="font-display text-2xl leading-tight">{state.status === "gone" ? p.goneTitle : p.errorTitle}</h1>
              <p className="text-pretty text-muted-foreground">{state.status === "gone" ? p.goneText : p.errorText}</p>
              {state.status === "error" && (
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "outline" }), "mt-1")}
                  onClick={() => {
                    setState({ status: "loading" });
                    void load();
                  }}
                >
                  <RefreshCw aria-hidden /> {p.retry}
                </button>
              )}
            </div>
          )}
        </main>
      </>
    );
  }

  const live = invite!.platforms.filter((x) => x.connected).length;
  const main = invite!.platforms.filter((x) => MAIN.includes(x.platform));
  const more = invite!.platforms.filter((x) => !MAIN.includes(x.platform));
  const tile = (x: Platform) => (
    <li
      key={x.platform}
      data-platform={x.platform}
      data-connected={x.connected || undefined}
      className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors", x.connected && "border-primary/35 bg-primary-soft/40")}
    >
      <div className="flex items-start justify-between gap-2">
        <BrandLogo id={brandId(x.platform)} className="size-7" />
        {x.connected && (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-hidden>
            <Check className="size-3.5" strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="grid min-w-0 gap-0.5">
        <h3 className="truncate text-[0.9375rem] font-semibold">{nameOf(x.platform)}</h3>
        <p className={cn("truncate text-xs", x.connected ? "font-medium text-primary-ink" : "text-muted-foreground")}>{x.connected ? p.connected : " "}</p>
        {x.connected && x.username && <p className="truncate text-xs text-muted-foreground">@{x.username}</p>}
      </div>
      {x.connected ? (
        <button
          type="button"
          onClick={() => void connect(x.platform)}
          disabled={connecting !== null}
          className="mt-auto flex h-9 items-center justify-center gap-1.5 rounded-lg text-[0.8125rem] font-medium text-muted-foreground transition-colors outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label={`${p.connectAnother}: ${nameOf(x.platform)}`}
        >
          {connecting === x.platform ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
          {p.connectAnother}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void connect(x.platform)}
          disabled={connecting !== null}
          className={cn(buttonVariants({ variant: "contrast" }), "mt-auto h-10 w-full rounded-xl text-[0.9375rem]")}
          aria-label={`${p.connect}: ${nameOf(x.platform)}`}
        >
          {connecting === x.platform ? (
            <>
              <Loader2 className="animate-spin" aria-hidden /> {p.connecting}
            </>
          ) : (
            p.connect
          )}
        </button>
      )}
    </li>
  );

  return (
    <>
      {header}
      <main id="main" className="mx-auto grid w-full max-w-xl flex-1 content-start gap-8 px-4 pt-8 pb-12 sm:px-6 sm:pt-12" data-invite-state="ready">
        <section aria-labelledby="invite-title" className="grid gap-3">
          <p className="text-sm font-medium text-muted-foreground">{p.forBusiness(invite!.businessName)}</p>
          <h1 id="invite-title" className="font-display text-[2.125rem] leading-[1.04] text-balance sm:text-[2.75rem]">
            {p.heading(agencyWord)}
          </h1>
          <p className="text-lg text-pretty text-muted-foreground">{p.lead}</p>
        </section>

        <section aria-labelledby="networks-title" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="networks-title" className="text-sm font-semibold">
              {p.networksTitle}
            </h2>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status" aria-live="polite">
              {syncing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <span className={cn("size-2 rounded-full", live ? "bg-primary" : "bg-foreground/20")} aria-hidden />}
              <span className="num">{p.progress(live)}</span>
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{main.map(tile)}</ul>
          {more.length > 0 && (
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                aria-controls="more-networks"
                className="flex w-fit items-center gap-1.5 rounded-md py-1 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} aria-hidden />
                {p.more}
              </button>
              <ul id="more-networks" hidden={!moreOpen} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {more.map(tile)}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="safe-title" className="flex items-start gap-3 rounded-2xl border border-dashed p-4">
          <LockKeyhole className="mt-0.5 size-5 shrink-0 text-foreground/70" aria-hidden />
          <div className="grid gap-1">
            <h2 id="safe-title" className="text-sm font-semibold">
              {p.safeTitle}
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">{p.safeText(agencyWord)}</p>
          </div>
        </section>

        <section aria-labelledby="next-title" className="grid gap-4 rounded-3xl bg-canvas p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl border bg-card">
              <BrandLogo id="whatsapp" className="size-5" />
            </span>
            <h2 id="next-title" className="font-display text-xl leading-tight">
              {p.nextTitle}
            </h2>
          </div>
          <p className="text-pretty text-muted-foreground">{p.nextText(agency ?? capitalize(p.fallbackAgency))}</p>
          <div className="flex justify-end">
            <p className="flex max-w-[19rem] items-center gap-2.5 rounded-2xl rounded-br-md border bg-card px-3.5 py-2.5 text-sm shadow-xs">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Mic className="size-3.5" aria-hidden />
              </span>
              <span className="text-pretty">{p.nextExample}</span>
            </p>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5 text-primary" aria-hidden /> {p.nextApprove}
          </p>
        </section>
      </main>
      <footer className="mx-auto flex w-full max-w-xl items-center gap-2 px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        {p.poweredBy} <Logo className="text-sm text-foreground/80" markClassName="size-5" />
      </footer>
    </>
  );
}

function capitalize(s: string) {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

function readPickedLang(): Lang | null {
  try {
    const v = sessionStorage.getItem(LANG_KEY);
    return v === "es" || v === "en" ? v : null;
  } catch {
    return null;
  }
}
