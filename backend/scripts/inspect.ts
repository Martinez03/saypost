// Prints the demo business's recent messages, actions and events (local debugging).
// Usage: npx tsx --env-file=.env.local scripts/inspect.ts [phone]
import { db } from "../src/db.js";

// No argument: the most recently created business that is not the local demo one.
const phone = process.argv[2];
const q = db.from("businesses").select("id,name,whatsapp_status,whatsapp_conversation_id,notes,zernio_profile_id");
const { data: b } = phone
  ? await q.eq("owner_phone", phone).single()
  : await q.neq("owner_phone", "34600000001").order("created_at", { ascending: false }).limit(1).single();
if (!b) throw new Error("no business");
console.log("business:", b);
const { data: m } = await db.from("messages").select("direction,kind,body,created_at").eq("business_id", b.id).order("created_at", { ascending: false }).limit(8);
console.log("\nmessages (newest first):");
for (const x of m ?? []) console.log(`  ${x.direction === "in" ? "→" : "←"} [${x.kind}] ${String(x.body).replace(/\n/g, " ⏎ ").slice(0, 300)}`);
const { data: a } = await db.from("actions").select("id,kind,status,title,preview,error").eq("business_id", b.id).order("created_at", { ascending: false }).limit(6);
console.log("\nactions (newest first):");
for (const x of a ?? []) console.log(`  ${x.status.padEnd(10)} ${x.kind.padEnd(13)} ${x.title}\n     ${String(x.preview).replace(/\n/g, " ⏎ ").slice(0, 400)}${x.error ? `\n     error: ${x.error}` : ""}`);
const { data: e } = await db.from("events").select("type,title,created_at").eq("business_id", b.id).order("created_at", { ascending: false }).limit(8);
console.log("\nevents:");
for (const x of e ?? []) console.log(`  ${x.type} · ${x.title}`);
