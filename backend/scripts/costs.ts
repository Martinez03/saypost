// Sums the usage ledger (Claude + transcription) by purpose.
// Usage: npx tsx --env-file=.env.local scripts/costs.ts
import { db } from "../src/db.js";

const { data, error } = await db.from("usage_ledger").select("provider,model,purpose,input_tokens,output_tokens,seconds,cost_usd,created_at");
if (error) throw error;
const by = new Map<string, { n: number; cost: number; inT: number; outT: number }>();
for (const r of data ?? []) {
  const k = `${r.provider}/${r.purpose}`;
  const v = by.get(k) ?? { n: 0, cost: 0, inT: 0, outT: 0 };
  v.n++;
  v.cost += Number(r.cost_usd);
  v.inT += r.input_tokens ?? 0;
  v.outT += r.output_tokens ?? 0;
  by.set(k, v);
}
let total = 0;
for (const [k, v] of by) {
  total += v.cost;
  console.log(
    `${k.padEnd(28)} calls ${String(v.n).padStart(3)}  avg in ${Math.round(v.inT / v.n)}  avg out ${Math.round(v.outT / v.n)}  total $${v.cost.toFixed(4)}  per call $${(v.cost / v.n).toFixed(4)}`,
  );
}
console.log(`TOTAL $${total.toFixed(4)} over ${data?.length ?? 0} calls`);
const { count: biz } = await db.from("businesses").select("id", { count: "exact", head: true });
const { count: msgs } = await db.from("messages").select("id", { count: "exact", head: true });
console.log(`businesses ${biz}, messages ${msgs}`);
