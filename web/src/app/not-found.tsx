import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { getI18n } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-20 text-center">
      <Logo />
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold">{t.errors.notFoundTitle}</h1>
        <p className="text-muted-foreground">{t.errors.notFoundText}</p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        {t.auth.backHome}
      </Link>
    </main>
  );
}
