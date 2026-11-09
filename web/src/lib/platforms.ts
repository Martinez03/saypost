// The networks the web offers to connect (docs/API.md), in display order, with a short glyph and a colour
// for the simple tiles used across the app (no third-party logos).

export type PlatformId =
  | "instagram"
  | "facebook"
  | "googlebusiness"
  | "linkedin"
  | "tiktok"
  | "twitter"
  | "threads"
  | "bluesky"
  | "youtube"
  | "pinterest";

export type PlatformInfo = { id: PlatformId; name: string; glyph: string; color: string };

export const PLATFORMS: PlatformInfo[] = [
  { id: "instagram", name: "Instagram", glyph: "IG", color: "linear-gradient(135deg,#f9a03f,#e1306c 55%,#833ab4)" },
  { id: "facebook", name: "Facebook", glyph: "f", color: "#1877f2" },
  { id: "googlebusiness", name: "Google Business", glyph: "G", color: "#4285f4" },
  { id: "linkedin", name: "LinkedIn", glyph: "in", color: "#0a66c2" },
  { id: "tiktok", name: "TikTok", glyph: "TT", color: "#111111" },
  { id: "twitter", name: "X", glyph: "X", color: "#111111" },
  { id: "threads", name: "Threads", glyph: "@", color: "#111111" },
  { id: "bluesky", name: "Bluesky", glyph: "BS", color: "#1185fe" },
  { id: "youtube", name: "YouTube", glyph: "YT", color: "#ff0000" },
  { id: "pinterest", name: "Pinterest", glyph: "P", color: "#e60023" },
];

const BY_ID = new Map<string, PlatformInfo>(PLATFORMS.map((p) => [p.id, p]));
// Names Zernio may use for the same networks.
const ALIASES: Record<string, PlatformId> = { x: "twitter", google: "googlebusiness", gmb: "googlebusiness", "google-business": "googlebusiness" };

export function platformInfo(id: string): PlatformInfo {
  const key = id.toLowerCase();
  return BY_ID.get(key) ?? BY_ID.get(ALIASES[key] ?? "") ?? { id: key as PlatformId, name: id, glyph: id.slice(0, 2).toUpperCase(), color: "#6b7280" };
}

export function platformName(id: string): string {
  return platformInfo(id).name;
}
