"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApprovalModeField } from "@/components/app/approval-mode-field";
import { BusinessFields, type BusinessValues } from "@/components/app/business-fields";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalMode } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";

type Values = BusinessValues & { notes: string; notify_reviews: boolean; notify_comments: boolean; notify_dms: boolean; approval_mode: ApprovalMode };

/** Edits the business through RLS: only the columns the web is granted (profile, notes, notify_*, approval_mode). */
export function SettingsForm({ id, email, initial, branding }: { id: string; email: string | null; initial: Values; branding?: ReactNode }) {
  const { t } = useI18n();
  const s = t.settings;
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  const [saved, setSaved] = useState<Values>(initial);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const patch = (p: Partial<Values>) => setValues((v) => ({ ...v, ...p }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = values.name.trim();
    if (!name) {
      setNameError(t.business.nameRequired);
      document.getElementById("biz-name")?.focus();
      return;
    }
    setSaving(true);
    const { error } = await createClient()
      .from("businesses")
      .update({
        name,
        category: values.category || null,
        city: values.city.trim() || null,
        description: values.description.trim() || null,
        tone: values.tone,
        language: values.language,
        timezone: values.timezone,
        notes: values.notes,
        notify_reviews: values.notify_reviews,
        notify_comments: values.notify_comments,
        notify_dms: values.notify_dms,
        approval_mode: values.approval_mode,
      })
      .eq("id", id);
    setSaving(false);
    if (error) {
      toast.error(error.message || t.common.genericError);
      return;
    }
    const next = { ...values, name };
    setValues(next);
    setSaved(next);
    toast.success(t.common.saved);
    // The sidebar shows the business name.
    startTransition(() => router.refresh());
  }

  const toggles: { key: "notify_reviews" | "notify_comments" | "notify_dms"; label: string; hint: string }[] = [
    { key: "notify_reviews", label: s.notifyReviews, hint: s.notifyReviewsHint },
    { key: "notify_comments", label: s.notifyComments, hint: s.notifyCommentsHint },
    { key: "notify_dms", label: s.notifyDms, hint: s.notifyDmsHint },
  ];

  return (
    <form onSubmit={save} className="grid gap-8" noValidate>
      <PageHeader title={s.title} description={s.subtitle} />

      {/* A comfortable reading width; on wide screens the profile on the left and the rest alongside. */}
      <div className="grid max-w-3xl items-start gap-8 wide:max-w-none wide:grid-cols-2">
        <section aria-labelledby="profile-title" className="grid gap-5 rounded-xl border bg-card p-4 shadow-xs sm:p-6">
          <SectionTitle id="profile-title" title={s.profileTitle} description={s.profileSubtitle} />
          <BusinessFields
            values={values}
            showTimezone
            nameError={nameError}
            onChange={(p) => {
              if (p.name !== undefined) setNameError(null);
              patch(p);
            }}
          />
        </section>

        <div className="grid content-start gap-8">
          <section aria-labelledby="notes-title" className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-6">
            <SectionTitle id="notes-title" title={s.notesTitle} description={s.notesSubtitle} />
            <Textarea
              id="notes"
              aria-labelledby="notes-title"
              rows={6}
              maxLength={8000}
              placeholder={s.notesPlaceholder}
              value={values.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </section>

          <section aria-labelledby="notify-title" className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-6">
            <SectionTitle id="notify-title" title={s.notifyTitle} description={s.notifySubtitle} />
            <ul className="divide-y rounded-lg border">
              {toggles.map((tg) => (
                <li key={tg.key} className="flex items-center justify-between gap-4 px-3 py-3">
                  <span className="grid gap-0.5">
                    <label htmlFor={tg.key} className="text-sm font-medium">
                      {tg.label}
                    </label>
                    <span id={`${tg.key}-hint`} className="text-xs text-muted-foreground">
                      {tg.hint}
                    </span>
                  </span>
                  <Switch id={tg.key} checked={values[tg.key]} onCheckedChange={(checked) => patch({ [tg.key]: checked })} aria-describedby={`${tg.key}-hint`} />
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="approval-title" className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-6" data-approval-mode>
            <SectionTitle id="approval-title" title={t.agency.approvalTitle} description={t.agency.approvalSubtitle} />
            <ApprovalModeField value={values.approval_mode} onChange={(approval_mode) => patch({ approval_mode })} />
          </section>

          {branding}
        </div>
      </div>

      {email && (
        <p className="text-sm text-muted-foreground">
          {s.accountTitle}: <span className="font-medium text-foreground">{email}</span>
        </p>
      )}

      <div className="sticky bottom-3 z-10 flex justify-end">
        <Button type="submit" size="lg" disabled={saving || !dirty} className="shadow-lg">
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {saving ? t.common.saving : t.common.save}
        </Button>
      </div>
    </form>
  );
}
