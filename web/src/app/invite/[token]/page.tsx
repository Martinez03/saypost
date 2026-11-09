import type { Metadata } from "next";
import { Familjen_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import { getDict, LANG_COOKIE, parseLang } from "@/i18n";
import { cn } from "@/lib/utils";
import { InvitePage } from "./invite-page";
import "@/components/landing/landing.css";

// Same display face as the landing.
const display = Familjen_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies();
  const t = getDict(parseLang(jar.get(LANG_COOKIE)?.value));
  return {
    title: t.invitePage.heading(t.invitePage.fallbackAgency),
    // The token is in the URL: keep it out of search engines and out of the Referer sent to other sites.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/**
 * The client invite page: no login. The business's client opens the link the agency sent and connects
 * their own networks. Data comes from the public, token-gated backend endpoints (in the browser, so the
 * per-IP rate limit sees the visitor's IP).
 */
export default async function InviteTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, jar] = await Promise.all([params, cookies()]);
  const cookieLang = jar.get(LANG_COOKIE)?.value;
  return (
    <div className={cn(display.variable, "landing flex flex-1 flex-col")}>
      <InvitePage token={token} cookieLang={cookieLang === "es" || cookieLang === "en" ? cookieLang : null} />
    </div>
  );
}
