import { Fragment, type ReactNode } from "react";

// Saypost writes with WhatsApp formatting (*bold*, _italic_, ~strike~) on both channels. This renders it as
// HTML, plus plain links. Text only: nothing is ever injected as markup.

const TOKEN = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?¿¡"'»])|\*(?=\S)([^*\n]+?)(?<=\S)\*|(?<![\p{L}\p{N}])_(?=\S)([^_\n]+?)(?<=\S)_(?![\p{L}\p{N}])|~(?=\S)([^~\n]+?)(?<=\S)~/gu;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (m[1])
      out.push(
        <a key={k} href={m[1]} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-ink underline underline-offset-2 [overflow-wrap:anywhere]">
          {m[1]}
        </a>,
      );
    else if (m[2]) out.push(<strong key={k}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3]}</em>);
    else if (m[4]) out.push(<s key={k}>{m[4]}</s>);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function WaText({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  return (
    <p className={className}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {inline(line, String(i))}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </p>
  );
}
