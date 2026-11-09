"use client";

// Runs during HTML parsing on a full page load; on the client it renders as text/plain, so React
// doesn't warn about rendering a <script>.
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
