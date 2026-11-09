import type { Metadata } from "next";
import { ChatPanel } from "@/components/app/chat/chat-panel";
import { PageHeader } from "@/components/app/page-header";
import { getI18n } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.chat.title };
}

// The chat with Saypost as a page: the same conversation as the floating button (shared state in the
// dashboard layout), sized to the window so the composer stays in view.
export default async function ChatPage() {
  const { t } = await getI18n();
  return (
    <div className="grid gap-4 lg:gap-6">
      <PageHeader title={t.chat.title} description={<span className="hidden sm:inline">{t.chat.subtitle}</span>} />
      <div className="h-[calc(100svh-9.5rem)] min-h-[26rem] max-w-5xl overflow-hidden rounded-xl border shadow-xs sm:h-[calc(100svh-12.5rem)] md:h-[calc(100svh-11.5rem)] lg:h-[calc(100svh-13.5rem)]">
        <ChatPanel variant="page" />
      </div>
    </div>
  );
}
