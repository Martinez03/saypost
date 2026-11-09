"use client";

import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">{t.errors.title}</h1>
      <p className="text-sm text-muted-foreground">{t.errors.text}</p>
      <Button variant="outline" onClick={reset}>
        {t.common.retry}
      </Button>
    </div>
  );
}
