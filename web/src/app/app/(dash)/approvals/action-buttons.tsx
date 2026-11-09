"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost } from "@/lib/api";
import type { Action } from "@/lib/database.types";

// Approve or discard a pending action through the backend (it executes in code), then refresh the list.

export function ActionButtons({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [refreshing, startTransition] = useTransition();

  async function decide(kind: "approve" | "reject") {
    setBusy(kind);
    try {
      const { action } = await apiPost<{ action: Pick<Action, "status" | "error"> | null }>(`/api/actions/${id}/${kind}`);
      if (kind === "reject") toast.success(t.approvals.rejected);
      else if (action?.status === "failed") toast.error(t.approvals.failed, { description: action.error ?? undefined });
      else if (action?.status === "done") toast.success(t.approvals.done);
      else toast.success(t.approvals.approved);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      toast.error(err?.error === "network" ? t.common.backendDown : (err?.message ?? t.common.genericError));
    } finally {
      setBusy(null);
      startTransition(() => router.refresh());
    }
  }

  const disabled = busy !== null || refreshing;
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => decide("approve")} disabled={disabled}>
        {busy === "approve" ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
        {t.approvals.approve}
      </Button>
      <Button variant="outline" onClick={() => decide("reject")} disabled={disabled}>
        {busy === "reject" ? <Loader2 className="animate-spin" aria-hidden /> : <X aria-hidden />}
        {t.approvals.reject}
      </Button>
    </div>
  );
}
