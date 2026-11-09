# Saypost

**Las redes sociales de un negocio local, desde WhatsApp.** El dueño manda un audio, un texto o una foto; Saypost escribe los posts, propone respuestas a reseñas, comentarios y DMs, y contesta "¿cómo vamos esta semana?". Nada sale sin que el dueño diga "sí".

[English](README.md) · [Guía de autoalojamiento (inglés)](docs/SELF_HOSTING.md) · [Contribuir](CONTRIBUTING.md) · [Seguridad](SECURITY.md)

## Qué hace

- **Del audio al post.** "Hoy tenemos cocido a 12 € hasta las 4, publícalo" y una foto se convierten en una versión por red (Instagram, Facebook, Google Business, LinkedIn, X, TikTok…), al momento o programada.
- **Reseñas, comentarios y DMs.** Llegan por webhook; Saypost avisa al dueño por WhatsApp y le propone la respuesta con el tono del negocio.
- **"¿Cómo vamos?"** Las cifras de la semana de Zernio Analytics, en cristiano y con un consejo.
- **Aprobar con un toque.** Cada propuesta llega con los botones *Sí / No* y también aparece en el panel web.
- **Panel bilingüe** (español / inglés): aprobaciones, publicaciones, cuentas, la conversación de WhatsApp y ajustes.

## Cómo funciona

WhatsApp → webhook de Zernio (firmado) → agente de Claude → acción `pending` → "sí" del dueño → API de Zernio.

También se puede hablar con el agente desde el chat del panel: es la misma conversación, y lo que propone sale como tarjeta con Aprobar y Descartar (nada va a WhatsApp).

Las herramientas del agente **solo proponen**: escriben una fila en `actions` con estado `pending` y mandan la vista previa al dueño. Publicar o responder se ejecuta en otro camino del código, y solo después del "sí" (botón, texto corto o panel). Esto se impone en el código, no en el prompt. Las reseñas, comentarios y DMs los escriben desconocidos: son datos, nunca instrucciones, y su texto no puede disparar ninguna herramienta.

## Tecnología

`backend/` en Node 22 + TypeScript (Fastify), `web/` en Next.js 16 con shadcn/ui y Tailwind 4, `supabase/` con Postgres y RLS. Integraciones: [Zernio](https://zernio.com), Claude (`claude-opus-5-5`) y OpenAI para transcribir audios.

## Empezar

```bash
git clone https://github.com/Martinez03/saypost.git && cd saypost
npx supabase link --project-ref <tu-proyecto> && npx supabase db push
cp backend/.env.example backend/.env.local && cp web/.env.example web/.env.local   # rellénalos
cd backend && npm install && npm run dev      # http://localhost:4100
cd web && npm install && npm run dev          # http://localhost:3100
```

Para tu propio servidor con Docker, dominio y HTTPS: `cp .env.example .env`, `docker compose --profile caddy up -d --build` y `node scripts/setup-zernio-webhook.mjs --env-file .env --test`. Todos los pasos en [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Hecho sobre Zernio

Saypost se construyó en un día para el reto de [Zernio](https://zernio.com). Todo lo que toca una red social pasa por su API: perfiles, enlaces de conexión, publicación, bandeja, reseñas, WhatsApp, analítica y webhooks firmados.

## Licencia

Ver [LICENSE](LICENSE).
