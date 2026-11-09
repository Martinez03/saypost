"use client";

/* eslint-disable @next/next/no-img-element -- avatars come from the networks' CDNs */

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2, Plus, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { useI18n } from "@/components/i18n-provider";
import { PlatformIcon } from "@/components/platform-icon";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, apiDelete, apiPost } from "@/lib/api";
import type { SocialAccount } from "@/lib/database.types";
import { PLATFORMS, platformInfo, platformName } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type Row = Pick<SocialAccount, "id" | "platform" | "username" | "display_name" | "profile_picture" | "status">;

export function AccountsGrid({ accounts, connected, invite }: { accounts: Row[]; connected: string | null; invite?: ReactNode }) {
  const { t } = useI18n();
  const a = t.accounts;
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Row | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const handledReturn = useRef(false);

  const errorText = (e: unknown) => {
    const err = e instanceof ApiError ? e : null;
    return err?.error === "network" ? t.common.backendDown : (err?.message ?? t.common.genericError);
  };

  async function sync(opts: { quiet?: boolean; platform?: string } = {}) {
    setSyncing(true);
    try {
      await apiPost<{ accounts: unknown[] }>("/api/accounts/sync");
      if (opts.platform) toast.success(a.connectedToast(platformName(opts.platform)));
      else if (!opts.quiet) toast.success(a.synced);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSyncing(false);
      startTransition(() => router.refresh());
    }
  }

  // Back from Zernio's connect flow (?connected=<platform>): sync once, then clean the URL.
  useEffect(() => {
    if (!connected || handledReturn.current) return;
    handledReturn.current = true;
    router.replace("/app/accounts", { scroll: false });
    void sync({ platform: connected });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per return from the connect flow
  }, [connected]);

  async function connect(platform: string) {
    setConnecting(platform);
    try {
      const { authUrl } = await apiPost<{ authUrl: string }>("/api/connect", { platform });
      if (!authUrl) throw new ApiError(500, "no_auth_url");
      // Zernio's connect page (external): it sends the owner back to /app/accounts?connected=<platform>.
      window.location.assign(authUrl);
    } catch (e) {
      toast.error(errorText(e));
      setConnecting(null);
    }
  }

  async function disconnect() {
    if (!confirm) return;
    setDisconnecting(true);
    try {
      await apiDelete<{ ok: boolean }>(`/api/accounts/${confirm.id}`);
      toast.success(a.disconnected);
      setConfirm(null);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setDisconnecting(false);
      startTransition(() => router.refresh());
    }
  }

  const byPlatform = new Map<string, Row[]>();
  for (const acc of accounts) {
    const key = platformInfo(acc.platform).id;
    byPlatform.set(key, [...(byPlatform.get(key) ?? []), acc]);
  }
  const connectedCount = accounts.filter((x) => x.status === "connected").length;
  const busy = syncing || refreshing;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={a.title}
        description={
          <>
            {a.subtitle} <span className="font-medium text-foreground">{a.connectedCount(connectedCount)}.</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void sync()} disabled={busy}>
              <RefreshCw className={cn(busy && "animate-spin")} aria-hidden />
              {a.sync}
            </Button>
            {invite}
          </>
        }
      />

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5">
        {PLATFORMS.map((p) => {
          const rows = byPlatform.get(p.id) ?? [];
          const live = rows.filter((r) => r.status === "connected");
          return (
            <li key={p.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex items-center gap-3">
                <PlatformIcon platform={p.id} className="size-10 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">{p.name}</h2>
                  <p className="text-xs text-muted-foreground">{live.length ? a.connectedCount(live.length) : a.notConnected}</p>
                </div>
              </div>

              {rows.length > 0 && (
                <ul className="grid gap-2">
                  {rows.map((r) => {
                    const name = r.display_name || r.username || p.name;
                    return (
                      <li key={r.id} className={cn("flex items-center gap-2.5 rounded-lg border bg-background p-2", r.status !== "connected" && "opacity-70")}>
                        {r.profile_picture ? (
                          <img src={r.profile_picture} alt="" className="size-8 shrink-0 rounded-full border bg-muted object-cover" loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground" aria-hidden>
                            {name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-sm font-medium">{name}</span>
                          {r.username && r.display_name && <span className="truncate text-xs text-muted-foreground">@{r.username.replace(/^@/, "")}</span>}
                        </span>
                        {r.status !== "connected" ? (
                          <Badge variant="secondary">{a.statusDisconnected}</Badge>
                        ) : (
                          <Button variant="ghost" size="icon-sm" onClick={() => setConfirm(r)} aria-label={`${a.disconnect}: ${name}`} title={a.disconnect}>
                            <Unlink aria-hidden />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {p.id === "googlebusiness" && (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                  {a.googleNote}
                </p>
              )}

              <Button
                variant={live.length || invite ? "outline" : "default"}
                className="mt-auto w-full"
                onClick={() => void connect(p.id)}
                disabled={connecting !== null}
                aria-label={`${live.length ? a.connectAnother : a.connect}: ${p.name}`}
              >
                {connecting === p.id ? <Loader2 className="animate-spin" aria-hidden /> : live.length ? <Plus aria-hidden /> : null}
                {live.length ? a.connectAnother : a.connect}
              </Button>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && !disconnecting && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{a.disconnectTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm ? a.disconnectText(`${confirm.display_name || confirm.username || platformName(confirm.platform)} (${platformName(confirm.platform)})`) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" disabled={disconnecting} />}>{t.common.cancel}</AlertDialogClose>
            <Button variant="destructive" onClick={() => void disconnect()} disabled={disconnecting}>
              {disconnecting && <Loader2 className="animate-spin" aria-hidden />}
              {a.disconnect}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
