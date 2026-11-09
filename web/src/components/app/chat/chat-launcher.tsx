"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ChatPanel } from "./chat-panel";
import { useChat } from "./chat-provider";

// The floating chat button on every dashboard page (not on the Chat page itself). It opens the same chat in a
// side sheet; a dot shows while Saypost works, or when it answered with the chat closed.

export function ChatLauncher() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { working, unread } = useChat();
  const [open, setOpen] = useState(false);
  if (pathname === "/app/chat") return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="fixed right-4 bottom-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_20px_rgb(16_16_24/0.22)] transition-transform outline-none hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 active:scale-95 md:right-6 md:bottom-6"
        aria-label={t.chat.open}
        title={t.chat.open}
        data-chat-launcher
      >
        <MessagesSquare className="size-5" aria-hidden />
        {(working || unread) && (
          <span className="absolute top-0.5 right-0.5 flex size-3" aria-hidden>
            {working && <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />}
            <span className={cn("relative inline-flex size-3 rounded-full ring-2 ring-background", working ? "bg-amber-400" : "bg-destructive")} />
          </span>
        )}
      </SheetTrigger>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[28rem]">
        <SheetTitle className="sr-only">{t.chat.title}</SheetTitle>
        <ChatPanel variant="sheet" onClose={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
