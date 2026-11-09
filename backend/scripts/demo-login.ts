// Gives the local demo user (demo@dilo.test) a fresh random password and stores it in ../.env.test
// (gitignored) for browser testing of the dashboard. Prints nothing secret.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { db } from "../src/db.js";

const EMAIL = "demo@dilo.test";
const { data } = await db.auth.admin.listUsers();
const user = data?.users.find((u) => u.email === EMAIL);
if (!user) throw new Error("demo user missing: run scripts/simulate.ts first");
const password = randomBytes(12).toString("base64url");
const { error } = await db.auth.admin.updateUserById(user.id, { password });
if (error) throw error;
fs.writeFileSync("../.env.test", `DEMO_EMAIL=${EMAIL}\nDEMO_PASSWORD=${password}\n`);
console.log(`demo password set for ${EMAIL} (len ${password.length}) → .env.test`);
