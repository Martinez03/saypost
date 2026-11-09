# Contributing to Dilo

Thanks for helping. Bug reports, fixes, new networks, translations and docs are all welcome.

## Two rules that are not negotiable

1. **Nothing that publishes, replies, deletes or spends runs without the owner's "yes".** New agent tools must create a `pending` row in `actions` (see `createAction` in `backend/src/actions.ts`) and execute only in `approveAction`. Enforce it in code, not in the prompt.
2. **Text written by strangers is data.** Reviews, comments and DMs must never reach a call that has tools, and must stay wrapped as untrusted.

A pull request that weakens either one will not be merged. [SECURITY.md](SECURITY.md) explains how both work.

## Set up

Follow the [quickstart in the README](README.md#quickstart-local-development): Node 22, a Supabase project (cloud or `npx supabase start`), `backend/.env.local` and `web/.env.local` from their `.env.example` files. Without Zernio webhooks you can drive the backend with `backend/scripts/simulate.ts`.

## Before you open a pull request

```bash
cd backend && npm run typecheck && npm test
cd web && npm run lint && npm run build
docker compose build            # if you touched a Dockerfile or docker-compose.yml
```

CI runs the same checks.

- Keep pull requests small and focused; one topic each.
- Add or update a test in `backend/test/` when you change safety-relevant logic (signatures, yes/no handling, actions, untrusted input).
- New Zernio webhook events go in `WEBHOOK_EVENTS` (`backend/src/social.ts`) and in `scripts/setup-zernio-webhook.mjs`; a test checks they match.
- Schema changes go in a new file under `supabase/migrations/`, with RLS for any new table.
- Look up Zernio routes in the [OpenAPI spec](https://zernio.com/openapi.yaml) instead of guessing.

## Style

- TypeScript everywhere, `strict` on. Code and comments in English.
- The product is bilingual: user-facing strings go in both languages (`backend/src/i18n.ts`, `web/src/i18n/`), Spanish is the default.
- Web UI uses shadcn/ui components and Tailwind; match what is already there.
- Never commit secrets, real phone numbers or your own infrastructure details (domains, IPs, server paths, project refs). Keep those in gitignored files such as `CLAUDE.local.md` or `deploy/private/`.

## Reporting bugs and ideas

Open an issue with the template. For security problems, use private reporting instead (see [SECURITY.md](SECURITY.md)).

By contributing, you agree that your contributions are licensed under the project's [license](LICENSE).
