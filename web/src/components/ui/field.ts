// Classes for native <textarea>, matching <Input> (height, border, focus ring). Selects use <Select> from ./select.

const base =
  "rounded-lg border border-input bg-background text-sm shadow-xs transition-[color,border-color,box-shadow] outline-none hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_12%)] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive dark:bg-input/10";

export const textareaClass = `w-full px-3 py-2 leading-relaxed placeholder:text-subtle-foreground ${base}`;

/** A box holding chips and a bare input (topics), with the focus ring on the box. */
export const chipFieldClass = `flex min-h-9 w-full flex-wrap items-center gap-1.5 px-2 py-1.5 ${base.replaceAll("focus-visible:", "focus-within:")}`;
