import type { ReactNode } from "react";
import { BRAND_NAMES, BrandGlyph, type BrandId } from "@/components/landing/brand-icons";
import { cn } from "@/lib/utils";

// Saypost's landing illustrations, drawn by hand as inline SVG in one style (see landing.css, "Illustration
// strokes"): 1.5px round ink lines, flat paper and well fills, warm for food photos, green only for the
// owner's "yes" and for what went live. Colours come from CSS variables, so light and dark both work.
// They are decorative: the text next to each one carries the meaning, so every SVG is aria-hidden.

function Ill({ viewBox, className, children }: { viewBox: string; className?: string; children: ReactNode }) {
  return (
    <svg viewBox={viewBox} className={cn("ill block h-auto w-full", className)} aria-hidden focusable="false">
      {children}
    </svg>
  );
}

/** Five-point star path centred on (cx, cy). */
function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

/** A small check mark inside a filled green badge. */
function CheckBadge({ x, y, r = 7 }: { x: number; y: number; r?: number }) {
  const s = r / 7;
  return (
    <g>
      <circle cx={x} cy={y} r={r} className="accent" />
      <path
        d={`M${x - 3 * s} ${y + 0.2 * s} l${2.2 * s} ${2.2 * s} l${4 * s} ${-4.6 * s}`}
        fill="none"
        stroke="var(--ill-paper)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** The stew pot that stands in for the owner's photo. Drawn on a 200x90 canvas. */
function Pot({ transform }: { transform?: string }) {
  return (
    <g transform={transform}>
      <path className="ink-thin" d="M30 80 H170" />
      <path className="ink" d="M84 30 c-5 -5 5 -8 0 -14 M100 26 c-5 -5 5 -8 0 -14 M116 30 c-5 -5 5 -8 0 -14" />
      <path className="ink" d="M62 52 h-8 a4.5 4.5 0 0 0 0 9 h8 M138 52 h8 a4.5 4.5 0 0 1 0 9 h-8" />
      <path className="paper" d="M62 46 H138 V64 a14 14 0 0 1 -14 14 H76 a14 14 0 0 1 -14 -14 Z" />
      <path className="ink-thin" d="M70 56 H130" />
      <path className="paper" d="M56 46 Q100 28 144 46 Z" />
      <rect className="paper" x="94" y="33" width="12" height="5" rx="2.5" />
    </g>
  );
}

/** The photo inside the chat preview: the pot on a warm ground. */
export function PotPhoto({ className }: { className?: string }) {
  return (
    <Ill viewBox="0 0 200 90" className={className}>
      <rect width="200" height="90" className="warm" />
      <Pot />
    </Ill>
  );
}

// ---------------------------------------------------------------- how it works: one vignette per step

export function StepVoice() {
  const bars = [8, 16, 24, 12, 20, 28, 14, 8, 18];
  return (
    <Ill viewBox="0 0 120 96">
      <path className="paper" d="M26 22 H94 A12 12 0 0 1 106 34 V54 A12 12 0 0 1 94 66 H40 L26 77 L28 66 H26 A12 12 0 0 1 14 54 V34 A12 12 0 0 1 26 22 Z" />
      <circle cx="33" cy="44" r="9" className="primary" />
      <path d="M30 39.5 L37.5 44 L30 48.5 Z" className="on-primary" />
      {bars.map((h, i) => (
        <line key={i} className="bar" x1={50 + i * 6} x2={50 + i * 6} y1={44 - h / 2} y2={44 + h / 2} />
      ))}
    </Ill>
  );
}

export function StepWrite() {
  return (
    <Ill viewBox="0 0 120 96">
      <rect className="paper" x="22" y="12" width="62" height="74" rx="6" />
      <path className="ink" d="M32 28 H74 M32 37 H74 M32 46 H68" />
      <path className="ink" d="M32 55 H52" />
      <path className="accent-line" d="M56 50 V60" />
      <g transform="rotate(-45 70 80)">
        <path className="paper" d="M70 80 L78 76 V84 Z" />
        <path className="ink-fill" d="M70 80 L73 78.5 V81.5 Z" />
        <rect className="paper" x="78" y="76" width="32" height="8" />
        <rect className="accent-soft" x="110" y="76" width="7" height="8" rx="2" stroke="var(--ill-ink)" strokeWidth="1.5" />
      </g>
    </Ill>
  );
}

export function StepPreview({ yes, no }: { yes: string; no: string }) {
  return (
    <Ill viewBox="0 0 120 96">
      <rect className="paper" x="20" y="6" width="80" height="84" rx="8" />
      <rect className="warm" x="26" y="12" width="68" height="30" rx="4" />
      <Pot transform="translate(26 12) scale(0.34)" />
      <path className="ink" d="M27 50 H88 M27 57 H74" />
      <path className="ink-thin" d="M20 66 H100 M60 66 V90" />
      <text x="40" y="82" textAnchor="middle" className="label" style={{ fill: "var(--primary-ink)", fontWeight: 600 }}>
        {yes}
      </text>
      <text x="80" y="82" textAnchor="middle" className="label-dim">
        {no}
      </text>
    </Ill>
  );
}

export function StepYes({ yes }: { yes: string }) {
  return (
    <Ill viewBox="0 0 120 96">
      <path
        className="accent-soft"
        stroke="var(--ill-ink)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        d="M34 26 H90 L100 20 L98 30 V52 A10 10 0 0 1 88 62 H34 A10 10 0 0 1 24 52 V36 A10 10 0 0 1 34 26 Z"
      />
      <text x="40" y="49" className="label" style={{ fontSize: 15, fontWeight: 600 }}>
        {yes}
      </text>
      <path className="accent-line" d="M70 44 l4 4.5 l9 -10" style={{ strokeWidth: 2 }} />
      <path className="ink" d="M20 70 l-7 7 M30 72 l-1 9 M16 61 h-8" />
    </Ill>
  );
}

export function StepLive() {
  const tiles: { x: number; y: number; id: BrandId }[] = [
    { x: 16, y: 18, id: "instagram" },
    { x: 104, y: 18, id: "facebook" },
    { x: 16, y: 78, id: "googlebusiness" },
    { x: 104, y: 78, id: "linkedin" },
  ];
  return (
    <Ill viewBox="0 0 120 96">
      {tiles.map((t) => (
        <path key={t.id} className="ink-thin dashed" d={`M60 48 L${t.x} ${t.y}`} />
      ))}
      <rect className="paper" x="44" y="30" width="32" height="36" rx="5" />
      <rect className="warm" x="48" y="34" width="24" height="14" rx="2" />
      <path className="ink" d="M49 54 H71 M49 60 H65" />
      {tiles.map((t) => (
        <g key={t.id}>
          <circle cx={t.x} cy={t.y} r="11" className="paper" />
          <BrandGlyph id={t.id} x={t.x - 6} y={t.y - 6} size={12} className="ink-fill" />
        </g>
      ))}
      <CheckBadge x={76} y={30} />
    </Ill>
  );
}

// ---------------------------------------------------------------- what it does

const FANOUT: { id: BrandId; x: number }[] = [
  { id: "instagram", x: 300 },
  { id: "facebook", x: 318 },
  { id: "googlebusiness", x: 294 },
  { id: "linkedin", x: 326 },
  { id: "x", x: 308 },
  { id: "tiktok", x: 290 },
];

export function PostsEverywhere() {
  return (
    <Ill viewBox="0 0 500 250">
      {FANOUT.map((n, i) => {
        const y = 22 + i * 41;
        return <path key={n.id} className="ink-thin" d={`M176 128 C 236 128, 236 ${y}, ${n.x} ${y}`} />;
      })}
      <rect className="paper" x="20" y="34" width="156" height="184" rx="12" />
      <rect className="warm" x="30" y="44" width="136" height="80" rx="6" />
      <Pot transform="translate(30 44) scale(0.68 0.89)" />
      <path className="ink" d="M32 142 H158 M32 153 H140 M32 164 H118" />
      <path className="ink" d="M36 196 c-2.6 -3.4 -8.4 -1.2 -6 3.4 l6 5.4 l6 -5.4 c2.4 -4.6 -3.4 -6.8 -6 -3.4 Z" />
      <path className="ink" d="M54 191 h12 a3 3 0 0 1 3 3 v6 a3 3 0 0 1 -3 3 h-8 l-4 3 v-3 a3 3 0 0 1 -3 -3 v-6 a3 3 0 0 1 3 -3 Z" />
      {FANOUT.map((n, i) => {
        const y = 22 + i * 41;
        const name = BRAND_NAMES[n.id];
        const w = 58 + name.length * 6.8;
        return (
          <g key={n.id}>
            <rect className="paper" x={n.x} y={y - 14} width={w} height="28" rx="14" />
            <BrandGlyph id={n.id} x={n.x + 8} y={y - 7} size={14} className="ink-fill" />
            <text x={n.x + 28} y={y + 4} className="label">
              {name}
            </text>
            <CheckBadge x={n.x + w - 14} y={y} r={6} />
          </g>
        );
      })}
    </Ill>
  );
}

export function ReviewReply({ yes, no }: { yes: string; no: string }) {
  return (
    <Ill viewBox="0 0 320 200">
      <rect className="paper" x="14" y="12" width="214" height="104" rx="10" />
      <circle cx="38" cy="38" r="12" className="well" stroke="var(--ill-ink)" strokeWidth="1.5" />
      <path className="ink" d="M58 33 H112" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={star(62 + i * 13, 47, 5.2)} className="star" />
      ))}
      <path className="ink-thin" d="M28 72 H210 M28 84 H196 M28 96 H150" />
      <rect className="accent-soft" x="92" y="100" width="214" height="88" rx="10" stroke="var(--ill-ink)" strokeWidth="1.5" />
      <path className="ink" d="M108 122 H286 M108 134 H262" />
      <rect className="primary" x="108" y="152" width="58" height="22" rx="6" />
      <text x="137" y="167" textAnchor="middle" className="label" style={{ fill: "var(--primary-foreground)", fontWeight: 600 }}>
        {yes}
      </text>
      <rect className="paper" x="172" y="152" width="58" height="22" rx="6" />
      <text x="201" y="167" textAnchor="middle" className="label">
        {no}
      </text>
    </Ill>
  );
}

/** The owner asks how the week went; Saypost answers in plain text (reach, reactions, reviews), not a chart. */
export function WeeklyMetrics({ question }: { question: string }) {
  const qw = Math.min(26 + question.length * 6.1, 292);
  return (
    <Ill viewBox="0 0 320 200">
      <rect className="accent-soft" x={306 - qw} y="12" width={qw} height="32" rx="10" stroke="var(--ill-ink)" strokeWidth="1.5" />
      <text x={306 - qw + 13} y="32" className="label" style={{ fontSize: 10.5 }}>
        {question}
      </text>
      <rect className="paper" x="14" y="58" width="250" height="130" rx="10" />
      <path className="accent-line" d="M30 94 l6 -6 l5 4 l8 -9 M44 83 h5 v5" />
      <path className="ink" d="M62 84 H214" />
      <path className="ink-thin" d="M62 95 H176" />
      <path className="ink" d="M40 115 c-2.6 -3.4 -8.4 -1.2 -6 3.4 l6 5.4 l6 -5.4 c2.4 -4.6 -3.4 -6.8 -6 -3.4 Z" />
      <path className="ink" d="M62 118 H230" />
      <path className="ink-thin" d="M62 129 H150" />
      <path d={star(40, 155, 7)} className="star" />
      <path className="ink" d="M62 152 H196" />
      <path className="ink-thin" d="M62 163 H168" />
    </Ill>
  );
}

// ---------------------------------------------------------------- one business or many

/** A corner shop with a striped awning, drawn in a 100x100 box. */
function Shop({ transform }: { transform: string }) {
  return (
    <g transform={transform} className="keep-stroke">
      <path className="ink-thin" d="M0 96 H100" />
      <rect className="paper" x="12" y="44" width="76" height="52" />
      <rect className="paper" x="20" y="56" width="30" height="26" rx="2" />
      <path className="ink-thin" d="M35 56 V82 M20 69 H50" />
      <rect className="well" x="58" y="56" width="22" height="40" rx="2" stroke="var(--ill-ink)" strokeWidth="1.5" />
      <path className="warm" stroke="var(--ill-ink)" strokeWidth="1.5" strokeLinejoin="round" d={`M4 26 H96 L90 44 ${"q-5 7 -10 0 ".repeat(8)}Z`} />
      <path className="ink-thin" d="M27 26 L26 44 M50 26 V44 M73 26 L74 44" />
      <rect className="paper" x="26" y="8" width="48" height="14" rx="3" />
      <path className="ink" d="M36 15 H64" />
    </g>
  );
}

export function ForBusiness({ yes }: { yes: string }) {
  const bars = [8, 14, 20, 10, 16, 24, 12, 8, 18, 12, 20, 9, 14, 7];
  return (
    <Ill viewBox="0 0 320 170">
      <Shop transform="translate(14 22) scale(1.22)" />
      <path className="ink-thin dashed" d="M136 96 C 150 96, 152 64, 164 62" />
      <path
        className="accent-soft"
        stroke="var(--ill-ink)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        d="M178 42 H296 L306 36 L304 48 V70 A12 12 0 0 1 292 82 H178 A12 12 0 0 1 166 70 V54 A12 12 0 0 1 178 42 Z"
      />
      <circle cx="186" cy="62" r="9" className="primary" />
      <path d="M183 57.5 L190.5 62 L183 66.5 Z" className="on-primary" />
      {bars.map((h, i) => (
        <line key={i} className="bar" x1={204 + i * 6.4} x2={204 + i * 6.4} y1={62 - h / 2} y2={62 + h / 2} />
      ))}
      <path
        className="accent-soft"
        stroke="var(--ill-ink)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        d="M242 104 H296 L306 98 L304 110 V128 A10 10 0 0 1 294 138 H242 A10 10 0 0 1 232 128 V114 A10 10 0 0 1 242 104 Z"
      />
      <text x="246" y="126" className="label" style={{ fontSize: 15, fontWeight: 600 }}>
        {yes}
      </text>
      <path className="accent-line" d="M276 120 l4 4.5 l9 -10" style={{ strokeWidth: 2 }} />
    </Ill>
  );
}

/** Several clients' shops feed one approval queue; some rows the agency approves, others the client does on WhatsApp. */
export function ForAgency({ yes }: { yes: string }) {
  const rows = [
    { y: 62, by: "agency" },
    { y: 102, by: "client" },
    { y: 142, by: "agency" },
  ] as const;
  return (
    <Ill viewBox="0 0 320 170">
      {rows.map((r, i) => (
        <path key={r.y} className="ink-thin dashed" d={`M56 ${16 + i * 52 + 24} C 100 ${16 + i * 52 + 24}, 110 ${r.y}, 150 ${r.y}`} />
      ))}
      {rows.map((r, i) => (
        <Shop key={r.y} transform={`translate(10 ${12 + i * 52}) scale(0.46)`} />
      ))}
      <rect className="paper" x="150" y="12" width="158" height="152" rx="10" />
      <path className="ink" d="M166 30 H222" />
      <path className="ink-thin" d="M150 42 H308 M150 82 H308 M150 122 H308" />
      {rows.map((r) => (
        <g key={r.y}>
          <circle cx="170" cy={r.y} r="9" className="warm" stroke="var(--ill-ink)" strokeWidth="1.5" />
          <path className="ink" d={`M186 ${r.y - 4} H236`} />
          <path className="ink-thin" d={`M186 ${r.y + 6} H222`} />
          {r.by === "agency" ? (
            <g>
              <rect className="primary" x="258" y={r.y - 11} width="38" height="22" rx="6" />
              <text x="277" y={r.y + 4} textAnchor="middle" className="label" style={{ fill: "var(--primary-foreground)", fontWeight: 600 }}>
                {yes}
              </text>
            </g>
          ) : (
            <g>
              <rect x="258" y={r.y - 11} width="38" height="22" rx="6" fill="none" className="ink-thin dashed" />
              <BrandGlyph id="whatsapp" x={270} y={r.y - 7} size={14} className="ink-fill" />
            </g>
          )}
        </g>
      ))}
    </Ill>
  );
}

// ---------------------------------------------------------------- safe by design

export function ApprovalGate({ yes, no, done, dropped }: { yes: string; no: string; done: string; dropped: string }) {
  return (
    <Ill viewBox="0 0 460 290">
      <path className="accent-line" d="M196 86 C 196 128, 110 124, 110 176" />
      <path className="accent-line" d="M103 167 L110 177 L117 167" />
      <path className="ink-thin dashed" d="M264 86 C 264 128, 350 124, 350 176" />
      <path className="ink-thin" d="M343 167 L350 177 L357 167" />

      <rect className="paper" x="140" y="18" width="180" height="68" rx="10" />
      <text x="158" y="45" className="label mono">
        publish_post
      </text>
      <text x="158" y="66" className="label-dim mono">
        status: pending
      </text>
      <path className="ink" d="M285 44 v-5 a7 7 0 0 1 14 0 v5" />
      <rect className="paper" x="280" y="44" width="24" height="18" rx="4" />
      <circle cx="292" cy="52" r="2" className="ink-fill" />

      <rect className="accent-soft" x="120" y="114" width="44" height="24" rx="12" />
      <text x="142" y="130" textAnchor="middle" className="label" style={{ fontWeight: 600 }}>
        {yes}
      </text>
      <rect className="well" x="296" y="114" width="44" height="24" rx="12" />
      <text x="318" y="130" textAnchor="middle" className="label-dim" style={{ fontSize: 11 }}>
        {no}
      </text>

      <rect className="paper" x="30" y="180" width="170" height="68" rx="10" />
      <text x="48" y="207" className="label">
        {done}
      </text>
      <text x="48" y="228" className="label-dim mono">
        status: done
      </text>
      <CheckBadge x={178} y={203} r={8} />

      <rect x="262" y="180" width="170" height="68" rx="10" fill="none" className="ink-thin dashed" />
      <text x="280" y="207" className="label-dim" style={{ fontSize: 11 }}>
        {dropped}
      </text>
      <text x="280" y="228" className="label-dim mono">
        status: rejected
      </text>
    </Ill>
  );
}
