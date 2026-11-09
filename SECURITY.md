# Security

Saypost can publish on a business's social accounts and reply to its customers. Two rules keep that safe, and both are enforced in code.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead: **Security → Report a vulnerability** on this repository.

Include what you found, how to reproduce it, and what an attacker could do with it. This is a small open-source project maintained in spare time: expect an answer within a week. Once a fix is out, we are happy to credit you.

Only the latest `main` is supported.

## Rule 1: nothing goes out without the owner's "yes"

The Claude agent has tools, but none of them publishes, replies, deletes or spends.

- Every `propose_*` tool (and `revise_reply`) inserts a row in `actions` with status `pending` and sends the owner the exact preview with *Yes / No* buttons (`backend/src/actions.ts`, `createAction` and `proposeToOwner`).
- Execution lives in a separate function, `approveAction`, reached from exactly three places:
  - a WhatsApp button tap whose payload is `approve:<action uuid>` for an action of that owner's business;
  - a short text confirmation from the owner ("yes", "ok", "sí"…, matched by a strict regex in `backend/src/inbound.ts`), which applies to that business's newest pending action;
  - `POST /api/actions/:id/approve` from the dashboard, authenticated with the owner's Supabase session and checked against their business.
- Approving is atomic: `UPDATE … WHERE status = 'pending'` claims the action, so a double tap or a race runs it once.
- The model's text never decides. A button tap or a "yes" is handled before the model sees the message.

## Rule 2: text from strangers is data, never instructions

Reviews, comments and DMs are written by people the business does not control.

- Replies to them are drafted in a one-shot call **with no tools** (`backend/src/agent/drafts.ts`). Their text is wrapped in `<untrusted>` tags and the system prompt says to treat it as data.
- Their text cannot trigger any tool by itself. The worst a prompt injection can do is shape the *wording* of a proposed reply, which the owner reads before saying yes.
- Only the business owner talks to the agent: WhatsApp messages from numbers that are not linked to a business are ignored.

## Webhooks

- `POST /webhooks/zernio` verifies the `X-Zernio-Signature` HMAC-SHA256 over the raw body with a timing-safe comparison, and rejects unsigned requests with 401.
- In production the backend refuses all webhooks (503) if `ZERNIO_WEBHOOK_SECRET` is not set.
- Events are deduplicated by their `id` before any processing.

## Data access

- The web uses only the Supabase anon key and the user's session; Row Level Security limits every user to their own business. The web can read `actions` but not change them: approving and rejecting go through the backend.
- The service role key, the Zernio key and the AI keys live only in the backend's environment.
- Voice notes are sent to OpenAI for transcription; messages and drafts are sent to Anthropic. Both are covered by those providers' API data policies.

## If you run your own instance

- Keep `.env`, `backend/.env.local` and `web/.env.local` out of git (the `.gitignore` already does) and never paste keys in issues or logs.
- Serve the backend over HTTPS only and use a long random `ZERNIO_WEBHOOK_SECRET`.
- Turn off public sign-ups in Supabase Auth if the instance is private: every business on it uses your Zernio, Claude and OpenAI quota.
- Rotate a key as soon as it may have leaked (Zernio, Anthropic, OpenAI, Supabase service role), then update `.env` and restart.

## Out of scope

Vulnerabilities in Zernio, Supabase, Anthropic, OpenAI or WhatsApp themselves (report them to those vendors), and attacks that require control of the owner's own phone or Supabase account.
