import type { ReactNode } from "react";
import { Familjen_Grotesk } from "next/font/google";
import { BRAND_NAMES, BrandIcon, NETWORKS, ZernioIcon, ZernioLogo } from "@/components/brand-icons";
import { ChatMock } from "@/components/landing/chat-mock";
import { CopyCommand } from "@/components/landing/copy-command";
import { GITHUB_URL, getGithubStars, githubFile } from "@/components/landing/github";
import { GithubButton } from "@/components/landing/github-button";
import {
  ApprovalGate,
  ForAgency,
  ForBusiness,
  PostsEverywhere,
  ReviewReply,
  StepLive,
  StepPreview,
  StepVoice,
  StepWrite,
  StepYes,
  WeeklyMetrics,
} from "@/components/landing/illustrations";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { buttonVariants } from "@/components/ui/button";
import { locale } from "@/i18n";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import "@/components/landing/landing.css";

// Display face for the landing only; the app keeps Inter everywhere.
const display = Familjen_Grotesk({ subsets: ["latin"], variable: "--font-display" });

const WRAP = "mx-auto w-full max-w-[78rem] px-5 sm:px-8 lg:px-12";
const H2 = "font-display text-[2.375rem] leading-[1.04] sm:text-5xl lg:text-[3.25rem]";
const H3 = "font-display text-xl leading-tight lg:text-[1.375rem]";
const LEAD = "text-lg text-pretty text-muted-foreground lg:text-xl";

/** Hand-drawn pointer from a note in the margin to the chat. */
function Note({ children, className, arrow }: { children: ReactNode; className?: string; arrow: "up" | "down" }) {
  return (
    <span aria-hidden className={cn("absolute hidden items-end gap-1 text-sm font-medium whitespace-nowrap text-muted-foreground xl:flex", className)}>
      <svg viewBox="0 0 60 40" className="ill h-8 w-12 shrink-0">
        {arrow === "up" ? (
          <path className="ink" d="M56 34 C 40 34, 22 30, 8 10 M6 19 L8 10 L17 12" />
        ) : (
          <path className="ink" d="M56 8 C 40 8, 22 12, 8 30 M7 21 L8 30 L17 27" />
        )}
      </svg>
      <span className={arrow === "up" ? "pb-0" : "-translate-y-6"}>{children}</span>
    </span>
  );
}

export default async function LandingPage() {
  const [{ t, lang }, stars] = await Promise.all([getI18n(), getGithubStars()]);
  const l = t.landing;
  const loc = locale(lang);
  const guideUrl = githubFile("docs/SELF_HOSTING.md");
  const steps = [
    <StepVoice key="voice" />,
    <StepWrite key="write" />,
    <StepPreview key="preview" yes={l.how.yes} no={l.how.no} />,
    <StepYes key="yes" yes={l.how.yes} />,
    <StepLive key="live" />,
  ];
  const postText = l.chat.draftText.split("\n")[0];
  const audiences = [
    { id: "negocios", ...l.audience.business, href: "#como-funciona", ill: <ForBusiness yes={l.how.yes} /> },
    { id: "agencias", ...l.audience.agency, href: "#instalar", ill: <ForAgency yes={l.how.yes} /> },
  ];
  const features = [
    { ...l.does.posts, ill: <PostsEverywhere /> },
    { ...l.does.inbox, ill: <ReviewReply yes={l.how.yes} no={l.how.no} /> },
    { ...l.does.metrics, ill: <WeeklyMetrics question={l.does.metrics.question} /> },
  ];

  return (
    <div className={cn(display.variable, "landing flex flex-1 flex-col")}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">
        {t.common.skipToContent}
      </a>
      <SiteHeader t={t} stars={stars} githubUrl={GITHUB_URL} locale={loc} />

      <main id="main" className="flex-1">
        {/* Hero */}
        <section aria-labelledby="hero-title">
          <div className={cn(WRAP, "grid items-center gap-12 pt-10 pb-14 sm:pt-14 lg:grid-cols-12 lg:gap-8 lg:pt-10 lg:pb-16")}>
            <div className="lg:col-span-6">
              <h1 id="hero-title" className="font-display text-[2.75rem] leading-[1.02] sm:text-6xl lg:text-[4.25rem] xl:text-[4.75rem]">
                {l.hero.title}
              </h1>
              <p className="mt-6 max-w-[32rem] text-lg text-pretty text-muted-foreground sm:text-xl">{l.hero.subtitle}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <a href="#instalar" className={cn(buttonVariants({ size: "xl" }), "h-12 px-6 text-base")}>
                  {l.hero.cta}
                </a>
                <a href="#como-funciona" className={cn(buttonVariants({ variant: "outline", size: "xl" }), "h-12 bg-transparent px-6 text-base")}>
                  {l.hero.secondary}
                </a>
              </div>
              <p className="mt-7 text-pretty text-muted-foreground">
                {l.audience.heroQuestion}{" "}
                <a href="#agencias" className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground">
                  {l.audience.heroLink}
                </a>
              </p>
            </div>
            <div className="lg:col-span-6">
              <div className="relative flex justify-center rounded-[2rem] bg-canvas px-4 py-6 sm:px-10 sm:py-8 xl:justify-start xl:pl-10">
                <ChatMock t={t} />
                <Note arrow="up" className="top-[8.75rem] left-[26rem]">
                  {l.hero.noteAudio}
                </Note>
                <Note arrow="down" className="top-[34rem] left-[26rem]">
                  {l.hero.noteYes}
                </Note>
              </div>
            </div>
          </div>
        </section>

        {/* Integrations: WhatsApp in, every network out, all through Zernio */}
        <section aria-labelledby="integrations-title" className="border-t">
          <h2 id="integrations-title" className="sr-only">
            {l.integrations.title}
          </h2>
          <div className={cn(WRAP, "grid gap-10 py-10 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-0 lg:divide-x lg:py-12")}>
            <div className="grid gap-3 lg:pr-10">
              <p className="text-sm text-muted-foreground">{l.integrations.whatsapp}</p>
              <p className="flex items-center gap-2.5 font-medium">
                <BrandIcon id="whatsapp" className="size-7" />
                {BRAND_NAMES.whatsapp}
              </p>
            </div>
            <div className="grid gap-4 lg:px-10">
              <p className="text-sm text-muted-foreground">{l.integrations.networks}</p>
              <ul className="grid grid-cols-5 gap-x-3 gap-y-5 sm:gap-x-4 lg:grid-cols-10">
                {NETWORKS.map((id) => (
                  <li key={id} className="grid justify-items-center gap-2 text-center">
                    <BrandIcon id={id} className="size-6 text-foreground/85" />
                    <span className="text-xs leading-tight text-muted-foreground">{BRAND_NAMES[id]}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-3 lg:pl-10">
              <p className="text-sm text-muted-foreground">{l.integrations.zernio}</p>
              <a href="https://zernio.com" target="_blank" rel="noopener noreferrer" className="flex w-fit items-center gap-2.5 rounded-md">
                <ZernioIcon className="size-7" />
                <ZernioLogo mark={false} className="h-[1.05rem]" />
              </a>
            </div>
          </div>
        </section>

        {/* One business or many: the two ways in */}
        <section id="para-quien" aria-labelledby="audience-title" className="scroll-mt-16 bg-canvas">
          <div className={cn(WRAP, "py-16 lg:py-24")}>
            <div className="grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-8">
              <h2 id="audience-title" className={cn(H2, "lg:col-span-6")}>
                {l.audience.title}
              </h2>
              <p className={cn(LEAD, "max-w-[34rem] lg:col-span-5 lg:col-start-8")}>{l.audience.subtitle}</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:mt-14 lg:gap-5">
              {audiences.map((a) => (
                <article
                  key={a.id}
                  id={a.id}
                  className="grid scroll-mt-20 content-start gap-6 rounded-3xl border bg-card p-6 sm:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-7"
                >
                  <div className="w-full max-w-[24rem]">{a.ill}</div>
                  <div>
                    <h3 className={H3}>{a.title}</h3>
                    <p className="mt-2 text-pretty text-muted-foreground">{a.text}</p>
                    <a href={a.href} className="mt-4 inline-block font-medium text-primary-ink underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
                      {a.link}
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="como-funciona" aria-labelledby="how-title" className="scroll-mt-16 border-t">
          <div className={cn(WRAP, "py-16 lg:py-24")}>
            <div className="grid gap-5 lg:grid-cols-12 lg:items-end lg:gap-8">
              <h2 id="how-title" className={cn(H2, "lg:col-span-6")}>
                {l.how.title}
              </h2>
              <p className={cn(LEAD, "max-w-[34rem] lg:col-span-5 lg:col-start-8")}>{l.how.subtitle}</p>
            </div>
            <ol className="mt-10 grid gap-8 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-12 lg:mt-14 lg:grid-cols-5 lg:gap-6">
              {l.how.steps.map((s, i) => (
                <li
                  key={s.title}
                  className={cn(
                    "relative grid grid-cols-[6.5rem_1fr] items-center gap-5 sm:grid-cols-1 sm:content-start sm:items-start sm:gap-4",
                    // Dashed connector to the next step on wide screens.
                    i < l.how.steps.length - 1 &&
                      "lg:after:absolute lg:after:top-[3.4rem] lg:after:left-[calc(100%-1.25rem)] lg:after:w-[2rem] lg:after:border-t-[1.5px] lg:after:border-dashed lg:after:border-[var(--ill-line)]",
                  )}
                >
                  <div className="w-full max-w-[9.5rem]">{steps[i]}</div>
                  <div>
                    <h3 className={H3}>{s.title}</h3>
                    <p className="mt-1.5 text-pretty text-muted-foreground">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What it does */}
        <section id="que-hace" aria-labelledby="does-title" className="scroll-mt-16 bg-canvas">
          <div className={cn(WRAP, "py-16 lg:py-24")}>
            <h2 id="does-title" className={cn(H2, "max-w-[22ch]")}>
              {l.does.title}
            </h2>
            <div className="mt-10 grid gap-12 lg:mt-14 lg:grid-cols-[1.5fr_1fr_1fr] lg:gap-0 lg:divide-x">
              {features.map((f, i) => (
                <article
                  key={f.title}
                  className={cn(
                    "grid content-start gap-6 sm:grid-cols-2 sm:items-center sm:gap-10 lg:grid-cols-1 lg:items-start lg:gap-7",
                    i === 0 ? "lg:pr-10" : i === 1 ? "lg:px-10" : "lg:pl-10",
                  )}
                >
                  <div className={cn("flex w-full items-end lg:h-[14.5rem]", i === 0 ? "max-w-[32rem]" : "max-w-[21rem]")}>{f.ill}</div>
                  <div>
                    <h3 className={H3}>{f.title}</h3>
                    <p className="mt-2 text-pretty text-muted-foreground">{f.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Safe by design */}
        <section id="seguridad" aria-labelledby="safety-title" className="scroll-mt-16">
          <div className={cn(WRAP, "grid items-center gap-12 py-20 lg:grid-cols-12 lg:gap-8 lg:py-28")}>
            <div className="lg:order-2 lg:col-span-6 lg:col-start-7">
              <h2 id="safety-title" className={H2}>
                {l.safety.title}
              </h2>
              <p className={cn(LEAD, "mt-5")}>{l.safety.subtitle}</p>
              <dl className="mt-8 divide-y border-y">
                {l.safety.points.map((p) => (
                  <div key={p.title} className="py-4">
                    <dt className={H3}>{p.title}</dt>
                    <dd className="mt-1.5 text-pretty text-muted-foreground">{p.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="mx-auto w-full max-w-[34rem] lg:order-1 lg:col-span-6 lg:max-w-none lg:pr-10">
              <ApprovalGate yes={l.safety.gate.yes} no={l.safety.gate.no} done={l.safety.gate.done} dropped={l.safety.gate.dropped} />
            </div>
          </div>
        </section>

        {/* Built on Zernio */}
        <section id="zernio" aria-labelledby="zernio-title" className="scroll-mt-16 border-t">
          <div className={cn(WRAP, "grid gap-12 py-16 lg:grid-cols-12 lg:gap-8 lg:py-24")}>
            <div className="lg:col-span-5">
              <a href="https://zernio.com" target="_blank" rel="noopener noreferrer" className="mb-7 flex w-fit rounded-xl" aria-label="zernio.com">
                <ZernioIcon className="size-12" />
              </a>
              <h2 id="zernio-title" className={H2}>
                {l.zernio.title}
              </h2>
              <p className={cn(LEAD, "mt-5")}>{l.zernio.subtitle}</p>
              <h3 className="mt-9 text-sm font-medium text-muted-foreground">{l.zernio.listTitle}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 border-t">
                {l.zernio.apis.map((a) => (
                  <div key={a.name} className="border-b py-2.5">
                    <dt className="font-mono text-[0.8125rem] leading-6">{a.name}</dt>
                    <dd className="text-sm text-muted-foreground">{a.text}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <figure className="min-w-0 lg:col-span-7 lg:self-end">
              <figcaption className="text-sm font-medium text-muted-foreground">{l.zernio.codeCaption}</figcaption>
              <pre className="mt-3 overflow-x-auto rounded-2xl border border-[var(--code-edge)] bg-[var(--code-bg)] p-5 font-mono text-[0.8125rem] leading-relaxed text-[var(--code-ink)] sm:p-6">
                <code>
                  <span className="text-[var(--code-key)]">curl</span> -X POST https://zernio.com/api/v1/posts \{"\n"}
                  {"  "}-H <span className="text-[var(--code-str)]">&quot;Authorization: Bearer $ZERNIO_API_KEY&quot;</span> \{"\n"}
                  {"  "}-H <span className="text-[var(--code-str)]">&quot;Content-Type: application/json&quot;</span> \{"\n"}
                  {"  "}-d <span className="text-[var(--code-str)]">&apos;{"{"}</span>
                  {"\n"}
                  <span className="text-[var(--code-str)]">
                    {"    "}&quot;content&quot;: &quot;{postText}&quot;,{"\n"}
                    {"    "}&quot;mediaItems&quot;: [{"{"} &quot;url&quot;: &quot;https://…/photo.jpg&quot;, &quot;type&quot;: &quot;image&quot; {"}"}],{"\n"}
                    {"    "}&quot;platforms&quot;: [{"\n"}
                    {"      "}{"{"} &quot;platform&quot;: &quot;instagram&quot;, &quot;accountId&quot;: &quot;…&quot; {"}"},{"\n"}
                    {"      "}{"{"} &quot;platform&quot;: &quot;facebook&quot;, &quot;accountId&quot;: &quot;…&quot; {"}"},{"\n"}
                    {"      "}{"{"} &quot;platform&quot;: &quot;googlebusiness&quot;, &quot;accountId&quot;: &quot;…&quot; {"}"}
                    {"\n"}
                    {"    "}],{"\n"}
                    {"    "}&quot;publishNow&quot;: true{"\n"}
                    {"  "}
                    {"}"}&apos;
                  </span>
                </code>
              </pre>
            </figure>
          </div>
        </section>

        {/* Self-host it */}
        <section id="instalar" aria-labelledby="selfhost-title" className="scroll-mt-16 bg-canvas">
          <div className={cn(WRAP, "grid gap-12 pt-16 pb-20 lg:grid-cols-12 lg:gap-8 lg:pt-24 lg:pb-32")}>
            <div className="lg:col-span-5">
              <h2 id="selfhost-title" className={H2}>
                {l.selfHost.title}
              </h2>
              <p className={cn(LEAD, "mt-5")}>{l.selfHost.subtitle}</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a href={guideUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "xl" }), "h-12 px-6 text-base")}>
                  {l.selfHost.guide}
                </a>
                <GithubButton href={GITHUB_URL} label={l.selfHost.star} stars={stars} starsLabel={l.nav.stars} locale={loc} size="lg" className="justify-center" />
              </div>
            </div>
            <ol className="grid content-start gap-9 lg:col-span-6 lg:col-start-7">
              {l.selfHost.steps.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-4">
                  <span className="num flex size-10 items-center justify-center rounded-full border bg-card font-mono text-sm" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="min-w-0 pt-1.5">
                    <h3 className={H3}>{s.title}</h3>
                    {i === 0 ? (
                      <div className="mt-3">
                        <CopyCommand command={`git clone ${GITHUB_URL}.git`} />
                      </div>
                    ) : (
                      <p className="mt-1.5 text-pretty text-muted-foreground">{s.text}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <SiteFooter t={t} githubUrl={GITHUB_URL} licenseUrl={githubFile("LICENSE")} guideUrl={guideUrl} />
    </div>
  );
}
