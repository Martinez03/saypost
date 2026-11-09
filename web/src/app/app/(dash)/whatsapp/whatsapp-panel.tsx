"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MessageCircle, RotateCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiGet, apiPost, type WhatsappStatusResponse } from "@/lib/api";
import type { WhatsappStatus } from "@/lib/database.types";
import { prettyPhone, waLink } from "@/lib/format";
import { cn } from "@/lib/utils";

const POLL_MS = 5000;

/** "+34 600 000 000" → "+34600000000" when it looks like an international number (8–15 digits). */
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "").replace(/^00/, "");
  if (!/^[+0-9\s().-]+$/.test(trimmed) || digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function WhatsappPanel({ initialStatus, initialPhone }: { initialStatus: WhatsappStatus; initialPhone: string | null }) {
  const { t } = useI18n();
  const w = t.whatsapp;
  const router = useRouter();
  const [info, setInfo] = useState<WhatsappStatusResponse>({ status: initialStatus, sandboxNumber: null, phone: initialPhone });
  const [loadError, setLoadError] = useState(false);
  const [phone, setPhone] = useState(initialPhone ? prettyPhone(initialPhone) : "");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const previous = useRef<WhatsappStatus>(initialStatus);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<WhatsappStatusResponse>("/api/whatsapp/status");
      setInfo(res);
      setLoadError(false);
      if (previous.current !== "active" && res.status === "active") {
        toast.success(w.nowActive);
        router.refresh();
      }
      previous.current = res.status;
    } catch {
      setLoadError(true);
    }
  }, [router, w.nowActive]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void load();
  }, [load]);

  // While the owner hasn't answered the activation message, check every 5 s.
  useEffect(() => {
    if (info.status !== "pending") return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [info.status, load]);

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) {
      setPhoneError(w.phoneInvalid);
      document.getElementById("wa-phone")?.focus();
      return;
    }
    setActivating(true);
    try {
      const res = await apiPost<WhatsappStatusResponse>("/api/whatsapp/activate", { phone: normalized });
      setInfo(res);
      previous.current = res.status;
      toast.success(w.activationSent);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      toast.error(apiErr?.error === "network" ? t.common.backendDown : (apiErr?.message ?? t.common.genericError));
    } finally {
      setActivating(false);
    }
  }

  const sandbox = info.sandboxNumber ? prettyPhone(info.sandboxNumber) : null;
  const chatLink = waLink(info.sandboxNumber);
  const statusVariant = info.status === "active" ? "positive" : info.status === "pending" ? "warning" : "secondary";

  return (
    <section aria-labelledby="wa-status-title" className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-xl",
              info.status === "active" ? "bg-positive/10 text-positive" : "bg-muted text-muted-foreground",
            )}
            aria-hidden
          >
            {info.status === "active" ? <CheckCircle2 className="size-5" /> : <Smartphone className="size-5" />}
          </span>
          <h2 id="wa-status-title" className="text-base font-semibold">
            {info.status === "active" ? w.activeTitle : info.status === "pending" ? w.pendingTitle : w.inactiveTitle}
          </h2>
        </div>
        <Badge variant={statusVariant}>{w.statuses[info.status]}</Badge>
      </div>

      {loadError && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <span>
            {w.statusError} {t.common.backendDown}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RotateCw aria-hidden /> {t.common.retry}
          </Button>
        </div>
      )}

      {info.status === "inactive" && (
        <form onSubmit={activate} className="grid gap-3" noValidate>
          <p className="text-sm text-muted-foreground">{w.inactiveText}</p>
          <div className="grid max-w-md gap-2">
            <Label htmlFor="wa-phone">{w.phone}</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="wa-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={w.phonePlaceholder}
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setPhoneError(null);
                }}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby="wa-phone-hint"
              />
              <Button type="submit" size="lg" disabled={activating} className="shrink-0">
                {activating && <Loader2 className="animate-spin" aria-hidden />}
                {w.activate}
              </Button>
            </div>
            <p id="wa-phone-hint" className={cn("text-xs", phoneError ? "text-destructive" : "text-muted-foreground")}>
              {phoneError ?? w.phoneHint}
            </p>
          </div>
        </form>
      )}

      {info.status === "pending" && (
        <div className="grid gap-3">
          <p className="max-w-2xl text-sm text-pretty">{sandbox ? w.pendingText(sandbox) : w.pendingTextNoNumber}</p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {w.pendingWaiting}
          </p>
          {chatLink && (
            <a href={chatLink} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }), "w-fit")}>
              <MessageCircle aria-hidden /> {w.openChat}
            </a>
          )}
        </div>
      )}

      {info.status === "active" && (
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1 rounded-lg border bg-positive/5 p-3">
              <p className="text-xs text-muted-foreground">{w.saypostNumber}</p>
              <p className="num text-lg font-semibold">{sandbox ?? "—"}</p>
              {chatLink && (
                <a href={chatLink} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "sm" }), "mt-1 w-fit")}>
                  <MessageCircle aria-hidden /> {w.openChat}
                </a>
              )}
            </div>
            <div className="grid content-start gap-1 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{w.yourNumber}</p>
              <p className="num text-lg font-semibold">{info.phone ? prettyPhone(info.phone) : "—"}</p>
            </div>
          </div>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">{w.examplesTitle}</h3>
            <ul className="flex flex-wrap gap-2">
              {w.examples.map((ex) => (
                <li key={ex} className="rounded-full border bg-bubble-out/60 px-3 py-1 text-sm">
                  «{ex}»
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{w.sandboxNote}</p>
    </section>
  );
}
