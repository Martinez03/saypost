import type { CSSProperties, ReactNode } from "react";
import { CheckCheck, Mic, Play } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { PotPhoto } from "@/components/landing/illustrations";
import type { Dict } from "@/i18n";
import { cn } from "@/lib/utils";

// A WhatsApp-style conversation built from plain elements (no screenshot, no phone frame): the owner
// sends a voice note, Saypost answers with the post preview and the same Yes/No buttons the bot sends,
// the owner taps "Yes" and Saypost confirms it's live. Strings match the backend's fixed WhatsApp texts.

const WAVE = [5, 9, 14, 8, 17, 11, 6, 13, 18, 10, 7, 15, 9, 12, 6, 10, 14, 7, 11, 5, 9, 13];

function Bubble({ side, children, time, className }: { side: "in" | "out"; children: ReactNode; time: string; className?: string }) {
  const out = side === "out";
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "relative max-w-[86%] rounded-xl px-2.5 pt-1.5 pb-1 text-[0.8125rem] leading-snug shadow-[0_1px_0.5px_rgb(0_0_0/0.12)]",
          out ? "rounded-tr-sm bg-bubble-out" : "rounded-tl-sm bg-bubble-in",
          className,
        )}
      >
        {children}
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[0.625rem] text-muted-foreground">
          {time}
          {out && <CheckCheck className="size-3 text-[var(--wa-tick)]" />}
        </span>
      </div>
    </div>
  );
}

export function ChatMock({ t, className }: { t: Dict; className?: string }) {
  const c = t.landing.chat;
  return (
    <figure className={cn("w-full max-w-[23rem]", className)}>
      <div role="img" aria-label={c.ariaLabel} className="overflow-hidden rounded-2xl border bg-card shadow-lg">
        <div aria-hidden>
          <div className="flex items-center gap-2.5 bg-[var(--wa-bar)] px-3.5 py-2.5 text-[var(--wa-bar-ink)]">
            <span className="flex size-8 items-center justify-center rounded-full bg-[var(--wa-bar-ink)]">
              <LogoMark className="size-6" />
            </span>
            <span className="grid leading-tight">
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="text-[0.6875rem] opacity-80">{c.status}</span>
            </span>
          </div>

          <div className="chat-wall grid gap-2 px-2.5 pt-3 pb-4">
            <span className="mx-auto rounded-md bg-bubble-in px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground shadow-xs">{c.today}</span>

            <Bubble side="out" time="13:02">
              <span className="flex items-center gap-2 py-0.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Play className="size-3.5 translate-x-px fill-current" />
                </span>
                <span className="dl-wave flex h-5 items-center gap-[2px]">
                  {WAVE.map((h, k) => (
                    <span key={k} className="w-[2.5px] rounded-full bg-foreground/45" style={{ height: h, "--d": k } as CSSProperties} />
                  ))}
                </span>
                <span className="num text-[0.6875rem] text-muted-foreground">{c.voiceDuration}</span>
              </span>
              <span className="mt-1 block max-w-[15rem] text-[0.75rem] text-muted-foreground italic">{c.transcript}</span>
            </Bubble>

            <Bubble side="in" time="13:02" className="w-[86%]">
              <span className="block">{c.draftIntro}</span>
              <span className="mt-1.5 block overflow-hidden rounded-lg border bg-background/70">
                <PotPhoto className="aspect-[200/90]" />
                <span className="block px-2 py-1.5 whitespace-pre-line">{c.draftText}</span>
              </span>
              <span className="mt-1.5 block">{c.question}</span>
              <span className="-mx-2.5 mt-1.5 grid grid-cols-2 border-t text-center text-[0.8125rem] font-medium text-primary-ink">
                <span className="border-r py-1.5">{c.yes}</span>
                <span className="py-1.5">{c.no}</span>
              </span>
            </Bubble>

            <Bubble side="out" time="13:03">
              <span className="font-medium">{c.yes}</span>
            </Bubble>

            <Bubble side="in" time="13:03">
              <span className="block">{c.published}</span>
            </Bubble>
          </div>

          <div className="flex items-center gap-2 border-t bg-card px-2.5 py-2">
            <span className="h-8 flex-1 rounded-full bg-muted" />
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Mic className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}
