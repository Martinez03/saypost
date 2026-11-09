"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Mail, Plus, Send, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { BrandIcon } from "@/components/landing/brand-icons";
import { useI18n } from "@/components/i18n-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getDict } from "@/i18n";
import { ApiError, apiDelete, apiGet, apiPost, type InviteCreated, type InviteSummary } from "@/lib/api";
import type { BusinessLanguage } from "@/lib/database.types";
import { relativeTime, waLink } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  businessId: string;
  businessName: string;
  /** The owner's mobile (digits), to open WhatsApp straight on their chat. */
  ownerPhone: string | null;
  /** The client's language: the message we prepare for them goes in it. */
  language: BusinessLanguage;
  /** The agency's name in the message ("So <agency> can run…"); null words it as "we". */
  agencyName: string | null;
  variant?: "default" | "outline";
  size?: "default" | "sm" | "lg";
  className?: string;
  label?: string;
};

/**
 * "Invite the client": creates a link (POST /api/invites) for that business and shows it once, with Copy,
 * WhatsApp and email, plus the active links with Revoke. Reopening keeps the same link instead of
 * creating another one.
 */
export function InviteClient({ businessId, businessName, ownerPhone, language, agencyName, variant = "outline", size = "default", className, label }: Props) {
  const { t, lang } = useI18n();
  const v = t.invites;
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<InviteCreated | null>(null);
  const [creating, setCreating] = useState(false);
  const [list, setList] = useState<InviteSummary[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const errorText = useCallback(
    (e: unknown) => {
      const err = e instanceof ApiError ? e : null;
      return err?.error === "network" ? t.common.backendDown : (err?.message ?? t.common.genericError);
    },
    [t],
  );

  const load = useCallback(async () => {
    try {
      const { invites } = await apiGet<{ invites: InviteSummary[] }>("/api/invites", businessId);
      setList(invites);
    } catch (e) {
      toast.error(errorText(e));
    }
  }, [businessId, errorText]);

  const create = useCallback(async () => {
    setCreating(true);
    try {
      const created = await apiPost<InviteCreated>("/api/invites", undefined, businessId);
      setLink(created);
      setCopied(false);
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setCreating(false);
    }
  }, [businessId, errorText, load]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    if (!link && !creating) void create();
    else void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [open]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Clipboard blocked: the link stays selectable in the field.
      document.getElementById(`invite-url-${businessId}`)?.focus();
    }
  }

  async function revoke(id: string) {
    setRevoking(id);
    try {
      await apiDelete<{ ok: boolean }>(`/api/invites/${id}`, businessId);
      if (link?.id === id) setLink(null);
      toast.success(v.revoked);
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setRevoking(null);
    }
  }

  const client = getDict(language).invites;
  const message = link ? client.message(agencyName, businessName, link.url) : "";
  const whatsapp = link ? (waLink(ownerPhone, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`) : "#";
  const email = link ? `mailto:?subject=${encodeURIComponent(client.emailSubject(businessName))}&body=${encodeURIComponent(message)}` : "#";
  const dateFmt = new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "long" });
  // eslint-disable-next-line react-hooks/purity -- relative times in a client list
  const now = Date.now();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ variant, size }), className)} data-invite-client={businessId}>
        <UserPlus aria-hidden /> {label ?? v.invite}
      </DialogTrigger>
      <DialogContent closeLabel={v.close} data-invite-dialog>
        <DialogHeader>
          <DialogTitle>{v.dialogTitle(businessName)}</DialogTitle>
          <DialogDescription>{v.dialogText}</DialogDescription>
        </DialogHeader>

        {!link ? (
          <div className="flex h-24 items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground" role="status">
            {creating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> {v.creating}
              </>
            ) : (
              <Button onClick={() => void create()}>
                <Plus aria-hidden /> {v.newLink}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <label htmlFor={`invite-url-${businessId}`} className="text-xs font-medium text-muted-foreground">
              {v.linkLabel}
            </label>
            <div className="-mt-1.5 flex items-center gap-1.5 rounded-lg border bg-muted/40 py-1 pr-1 pl-3">
              <input
                id={`invite-url-${businessId}`}
                readOnly
                value={link.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 truncate bg-transparent font-mono text-[0.8125rem] outline-none"
                data-invite-url
              />
              <Button size="sm" variant={copied ? "secondary" : "default"} onClick={() => void copy()}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                <span aria-live="polite">{copied ? v.copied : v.copy}</span>
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
                <BrandIcon id="whatsapp" className="size-4 text-[#25D366]" /> {v.sendWhatsapp}
              </a>
              <a href={email} className={cn(buttonVariants({ variant: "outline" }), "h-9")}>
                <Mail aria-hidden /> {v.sendEmail}
              </a>
            </div>
            <p className="text-xs text-pretty text-muted-foreground">
              {v.expires(dateFmt.format(new Date(link.expiresAt)))} {v.shownOnce}
            </p>
          </div>
        )}

        <section aria-labelledby={`invites-${businessId}`} className="grid gap-2 border-t pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 id={`invites-${businessId}`} className="text-[0.8125rem] font-semibold">
              {v.activeTitle}
            </h3>
            {link && (
              <Button variant="ghost" size="sm" onClick={() => void create()} disabled={creating}>
                {creating ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} {v.newLink}
              </Button>
            )}
          </div>
          {list === null ? (
            <p className="text-xs text-muted-foreground">{t.common.loading}</p>
          ) : list.length === 0 ? (
            <p className="text-xs text-muted-foreground">{v.activeEmpty}</p>
          ) : (
            <ul className="grid gap-1.5" data-invite-list>
              {list.map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                  <span className="grid min-w-0 flex-1 text-xs">
                    <span className="truncate font-medium text-foreground">
                      {v.created(relativeTime(i.createdAt, lang, now))}
                      {link?.id === i.id && <span className="ml-1.5 rounded bg-primary-soft px-1.5 py-px text-[0.6875rem] text-primary-ink">{v.thisOne}</span>}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {v.expiresShort(dateFmt.format(new Date(i.expiresAt)))} · {i.lastUsedAt ? v.opened(relativeTime(i.lastUsedAt, lang, now)) : v.notOpened}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void revoke(i.id)} disabled={revoking !== null}>
                    {revoking === i.id && <Loader2 className="animate-spin" aria-hidden />}
                    {v.revoke}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
