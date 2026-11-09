# Self-hosting Dilo

This guide takes you from a fresh clone to a running Dilo that answers on WhatsApp: your own server, your own domain, your own keys.

- [What you are running](#what-you-are-running)
- [Requirements](#requirements)
- [1. Clone](#1-clone)
- [2. Supabase](#2-supabase)
- [3. Keys](#3-keys)
- [4. Configure `.env`](#4-configure-env)
- [5. Run with Docker Compose](#5-run-with-docker-compose)
- [6. Deploy the web elsewhere (optional)](#6-deploy-the-web-elsewhere-optional)
- [7. Register the Zernio webhook](#7-register-the-zernio-webhook)
- [8. WhatsApp: sandbox vs. your own number](#8-whatsapp-sandbox-vs-your-own-number)
- [9. Connect social accounts](#9-connect-social-accounts)
- [Costs](#costs)
- [Updating and backups](#updating-and-backups)
- [Troubleshooting](#troubleshooting)

## What you are running

| Piece | What it does | Where it runs |
|---|---|---|
| **backend** (`backend/`) | Receives Zernio webhooks, runs the Claude agent, transcribes voice notes, executes approved actions, serves the dashboard API on port 4100. | Docker (`backend/Dockerfile`) or any Node 22 host. Needs a **public HTTPS URL** so Zernio can deliver webhooks. |
| **web** (`web/`) | Landing, sign-up, onboarding and dashboard (Next.js) on port 3100. Talks to Supabase with the user's session and to the backend. | Docker (`web/Dockerfile`), Netlify or Vercel. |
| **Supabase** | Postgres with Row Level Security, and Auth (email + password). | Supabase Cloud (free tier is enough to start) or self-hosted Supabase. |
| **Zernio** | Everything that touches a social network and WhatsApp. One Zernio profile per business, all under your Zernio account. | [zernio.com](https://zernio.com) |
| **Caddy** (optional) | Reverse proxy with automatic HTTPS for one domain: `/api/*`, `/webhooks/*`, `/health` → backend, the rest → web. | `docker compose --profile caddy` |

Everyone who signs up on your instance uses **your** Zernio account and **your** Claude and OpenAI keys. If the instance is only for you or your clients, turn off public sign-ups once your accounts exist (see [step 2](#2-supabase)).

## Requirements

- A **Zernio** account and API key ([zernio.com](https://zernio.com)). The plan decides how many social accounts you can connect.
- A **Supabase** project (cloud or self-hosted). The Supabase CLI (`npx supabase`) to apply the schema.
- An **Anthropic** API key ([console.anthropic.com](https://console.anthropic.com)) for the agent.
- An **OpenAI** API key ([platform.openai.com](https://platform.openai.com)), only for voice notes. Optional: without it Dilo asks the owner to type.
- A **server with Docker** (Docker Engine with Compose v2.24+). 1 vCPU and 1 GB RAM are enough for a handful of businesses. Or any host that runs Node 22.
- A **domain** (or subdomain) whose DNS you control, for the public HTTPS URL. For quick tests, a tunnel (`cloudflared`, `ngrok`) works.
- **Node 22** on the machine where you run `scripts/setup-zernio-webhook.mjs` (or use the one-liner with Docker in [step 7](#7-register-the-zernio-webhook)).

## 1. Clone

```bash
git clone https://github.com/Martinez03/dilo.git
cd dilo
```

## 2. Supabase

### Supabase Cloud

1. Create a project at [supabase.com](https://supabase.com) and note its **project ref** (in the URL: `https://supabase.com/dashboard/project/<ref>`) and database password.
2. Apply the schema:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   This runs `supabase/migrations/*.sql`: tables, indexes and Row Level Security policies.
3. **Project Settings → API**: copy the **Project URL**, the **anon** (or publishable) key and the **service_role** (or secret) key. The service role key bypasses RLS: it only goes to the backend.
4. **Authentication → URL Configuration**: set **Site URL** to your public web URL (e.g. `https://dilo.example.com`) and add `https://dilo.example.com/**` to **Redirect URLs**.
5. **Authentication → Providers → Email**:
   - *Confirm email*: off is the quickest way to try Dilo. To keep it on, configure your own SMTP under **Authentication → Emails** (Supabase's built-in sender is heavily rate-limited).
   - *Allow new users to sign up*: turn it off once your own accounts exist if the instance is private. Every business on your instance spends your Zernio, Claude and OpenAI quota.

### Local Supabase (development)

```bash
npx supabase start      # Docker; ports come from supabase/config.toml (API on 57321)
npx supabase db reset   # applies the migrations
npx supabase status     # prints the local URL and keys
```

Local Supabase is meant for `npm run dev`. On a server, use Supabase Cloud or a self-hosted Supabase reachable over HTTPS: the browser and the backend container both need to reach the same `SUPABASE_URL`.

## 3. Keys

| Key | Where to get it |
|---|---|
| `ZERNIO_API_KEY` | Zernio dashboard → API keys. One key for the whole instance. |
| `ZERNIO_WEBHOOK_SECRET` | You make it up. Any long random string: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` or `openssl rand -hex 24`. |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API keys. |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API keys (optional). |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | [Step 2](#2-supabase). |

## 4. Configure `.env`

```bash
cp .env.example .env
```

Docker Compose reads `.env` next to `docker-compose.yml`. The backend container gets every variable; the web image only gets the public ones, as build arguments.

| Variable | Used by | Required | Notes |
|---|---|---|---|
| `DOMAIN` | Caddy | with `--profile caddy` | e.g. `dilo.example.com`. Its DNS must point at the server. |
| `WEB_URL` | backend, web | yes | Public URL of the dashboard, e.g. `https://dilo.example.com`. The backend's CORS origin and the return URL after connecting accounts. No trailing slash. |
| `API_URL` | web, webhook script | yes | Public URL of the backend. With the bundled Caddy it is the same as `WEB_URL`. |
| `WEB_ORIGINS` | backend | no | Extra CORS origins, comma-separated. `*` matches inside one host label: `https://*--my-dilo.netlify.app`. |
| `SUPABASE_URL` | backend, web | yes | Project URL. |
| `SUPABASE_ANON_KEY` | web | yes | Public; baked into the web bundle. |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | yes | Secret. |
| `ANTHROPIC_API_KEY` | backend | yes | |
| `OPENAI_API_KEY` | backend | no | Voice notes. |
| `ZERNIO_API_KEY` | backend, webhook script | yes | |
| `ZERNIO_WEBHOOK_SECRET` | backend, webhook script | yes | In production the backend refuses webhooks (503) without it. |
| `CLAUDE_MODEL` | backend | no | Default `claude-opus-5-5`. |
| `OPENAI_TRANSCRIBE_MODEL` | backend | no | Default `gpt-4o-mini-transcribe`. |
| `REVIEW_POLL_SECONDS` | backend | no | Facebook reviews have no webhook; they are polled every 120 s. `0` disables it. |
| `BACKEND_PORT`, `WEB_PORT` | compose | no | Host ports, bound to `127.0.0.1`. Defaults 4100 and 3100. |

Running without Docker? The same variables go in `backend/.env.local` (see `backend/.env.example`) and `web/.env.local` (see `web/.env.example`, where they are called `NEXT_PUBLIC_*`).

## 5. Run with Docker Compose

### A. With the bundled Caddy (simplest)

One domain serves everything over HTTPS; Caddy gets and renews the certificate.

1. Point an `A` (and `AAAA` if you have IPv6) record for `DOMAIN` at the server. Open ports 80 and 443.
2. In `.env`: `DOMAIN=dilo.example.com`, `WEB_URL=https://dilo.example.com`, `API_URL=https://dilo.example.com`.
3. Start:

   ```bash
   docker compose --profile caddy up -d --build
   docker compose ps
   curl -s https://dilo.example.com/health
   ```

   `/health` answers `{"ok":true,"zernio":true,"claude":true,"transcribe":true}`. A `false` means that key is missing.

### B. Behind your own reverse proxy

`docker compose up -d --build` publishes the backend on `127.0.0.1:4100` and the web on `127.0.0.1:3100`. Point your proxy at them, either on one domain (send `/api/*`, `/webhooks/*` and `/health` to 4100, the rest to 3100, as `deploy/Caddyfile` does) or on two (e.g. `api.example.com` → 4100, `example.com` → 3100, then `API_URL=https://api.example.com`).

### C. Without Docker

```bash
cd backend && npm ci && npm run build && NODE_ENV=production node --env-file=.env.local dist/main.js
cd web && npm ci && npm run build && npm start      # reads web/.env.local at build time
```

Keep both running with systemd, pm2 or your platform's process manager, behind an HTTPS proxy.

> The web inlines `NEXT_PUBLIC_*` values at build time. After changing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `API_URL` or `WEB_URL`, rebuild it: `docker compose build web && docker compose up -d web`.

## 6. Deploy the web elsewhere (optional)

The backend must stay on a server (it receives webhooks and runs long agent turns), but the web can go to a static-friendly host:

- **Netlify**: new site from the repo, *Base directory* `web` (`web/netlify.toml` sets the build). Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (your backend), `NEXT_PUBLIC_SITE_URL` (the site).
- **Vercel**: import the repo, *Root Directory* `web`, same four variables.

Then set the backend's `WEB_URL` to the site's URL (and `WEB_ORIGINS=https://*--<site>.netlify.app` if you want deploy previews to work), restart the backend, and update Supabase's Site URL and Redirect URLs ([step 2](#2-supabase)).

## 7. Register the Zernio webhook

Zernio needs to know where to send WhatsApp messages and social events, and with which secret to sign them:

```bash
node scripts/setup-zernio-webhook.mjs --env-file .env --dry-run   # shows what it would do
node scripts/setup-zernio-webhook.mjs --env-file .env --test      # creates/updates it and sends a test event
```

- The URL is `$API_URL/webhooks/zernio` (override with `--url`).
- It subscribes to the events the backend handles: `message.received`, `review.new`, `comment.received`, `account.connected`, `account.disconnected`, `post.published`, `post.partial`, `post.failed`.
- If a webhook with the same URL already exists it is updated, not duplicated. The script never prints the API key or the secret.
- `--test` makes Zernio send a signed `webhook.test` event. The backend log (`docker compose logs backend`) should show `zernio webhook` with that event; `bad signature` means the backend runs with a different `ZERNIO_WEBHOOK_SECRET`.

No Node on the server? Run it in a throwaway container:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine node scripts/setup-zernio-webhook.mjs --env-file .env --test
```

You can also create the webhook by hand in the Zernio dashboard: same URL, same secret, same events.

## 8. WhatsApp: sandbox vs. your own number

Dilo talks to each business owner on WhatsApp through Zernio. Owners are matched by their phone number, saved in the dashboard (**WhatsApp** page).

### Sandbox (testing)

Zernio's WhatsApp sandbox needs no Meta setup, so it is the quickest way to try Dilo:

1. In the dashboard, **WhatsApp → Activate** with the owner's mobile in international format. The backend starts a sandbox session; Zernio sends a WhatsApp template from the sandbox number.
2. The owner replies to that template to open the session.
3. **The owner then sends one more message** (e.g. "hi"). The activation reply itself does not fire `message.received`, so Dilo only links the conversation on the next message.

Sandbox limits: one test phone, 50 messages a day, and the 24-hour customer-service window (Dilo can only write to the owner within 24 hours of their last message).

### Your own WhatsApp Business number (production)

Connect a WhatsApp Business number to your Zernio account (see Zernio's WhatsApp docs). The backend already handles messages from any WhatsApp account: when a known owner writes to that number, Dilo answers on the same conversation. Current limitations:

- The dashboard's **Activate** button still starts a sandbox session. With your own number, save the owner's phone in the dashboard and have them message your number directly.
- Notifications about new reviews or comments sent more than 24 hours after the owner's last message need approved WhatsApp templates, which Dilo does not send yet.

Contributions here are welcome; see [CONTRIBUTING.md](../CONTRIBUTING.md).

## 9. Connect social accounts

In the dashboard, **Accounts → Connect** a network. The backend creates the business's Zernio profile on first use (`externalId` = the business id) and returns Zernio's connect link; after authorizing, Zernio sends the owner back to `WEB_URL/app/accounts?connected=<platform>` and the account appears. Zernio also fires `account.connected`, and Dilo confirms it on WhatsApp.

Each connected account counts against your Zernio plan, across all businesses on your instance.

## Costs

Rough numbers at the time of writing; check each provider's pricing page.

| Item | Cost |
|---|---|
| Zernio | Free plan to try (a small number of connected accounts); paid plans by connected accounts. |
| Claude | Per message to the agent; most turns are a few thousand input tokens. `backend/scripts/costs.ts` sums the `usage_ledger` table: `cd backend && npx tsx --env-file=.env.local scripts/costs.ts`. Set `CLAUDE_MODEL` to a smaller model to spend less. |
| OpenAI transcription | `gpt-4o-mini-transcribe`, about $0.003 per minute of audio. |
| Supabase | Free tier is plenty for a few businesses. |
| Server | Any small VPS. The backend uses ~100–250 MB of RAM, the web ~150 MB, Caddy ~30 MB. |

## Updating and backups

```bash
git pull
npx supabase db push                          # only if supabase/migrations changed
docker compose --profile caddy up -d --build  # or without --profile if you run your own proxy
```

All state lives in Supabase (businesses, messages, actions, events, usage). Use Supabase's backups (daily on paid plans) or `npx supabase db dump`. The containers are stateless; Caddy keeps its certificates in the `caddy_data` volume.

## Troubleshooting

**`/health` is not reachable.** `docker compose ps` and `docker compose logs backend`. The backend exits at start if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing.

**Caddy does not get a certificate.** The `DOMAIN` DNS record must point at this server and ports 80 and 443 must be open (check your cloud firewall). `docker compose logs caddy` says why. An empty `DOMAIN` makes Caddy fail to start.

**Webhooks return 401 `bad_signature`.** The backend's `ZERNIO_WEBHOOK_SECRET` differs from the one registered in Zernio. Fix `.env`, run `docker compose up -d backend` and `node scripts/setup-zernio-webhook.mjs --env-file .env --test` again.

**Webhooks return 503 `webhook_secret_not_configured`.** Production mode refuses unsigned webhooks: set `ZERNIO_WEBHOOK_SECRET`.

**The owner writes on WhatsApp and nothing happens.**
- After activating the sandbox, the owner has to send one more message after replying to the template.
- `docker compose logs backend | grep inbound`: "WhatsApp message from an unknown number" means the phone saved in the dashboard does not match the sender (use the full international number).
- Sandbox limits: 50 messages a day, one phone, 24-hour window.
- In Zernio's dashboard, check the webhook's delivery logs and that it is active (Zernio disables endpoints that keep failing for days).

**The browser shows CORS errors.** `WEB_URL` must match the page's origin exactly: scheme, host, port, no trailing slash. Add other origins to `WEB_ORIGINS`.

**The dashboard calls the wrong backend or the wrong Supabase.** `NEXT_PUBLIC_*` values are baked in at build time: rebuild the web after changing them.

**Sign-up says "check your email" and no email arrives.** Email confirmation is on and Supabase's default sender is rate-limited. Configure SMTP or turn confirmation off ([step 2](#2-supabase)).

**Connecting an account comes back but the account is missing.** The dashboard syncs accounts from Zernio on return (`POST /api/accounts/sync`). Check `WEB_URL` (Zernio redirects there) and the backend log for Zernio errors such as plan limits.

**Voice notes get "I couldn't understand the audio".** `OPENAI_API_KEY` is missing or out of quota (`/health` shows `"transcribe":false` when missing).

**Facebook reviews arrive late.** They have no webhook and are polled every `REVIEW_POLL_SECONDS` (120 s by default).

Still stuck? Open an issue with the backend log lines (remove phone numbers and keys first).
