# Diario

- **2026-11-09**: Nace Dilo para el reto de Zernio. Supabase con el esquema inicial y RLS. Backend en Fastify: webhooks firmados de Zernio, agente de WhatsApp con Claude Opus 5.5 (propuestas que esperan el "sí"), borradores de respuestas a reseñas, comentarios y DMs, transcripción de audios con OpenAI y endpoints del dashboard. Desplegado en Docker en el servidor del dueño. Webhook registrado en Zernio.
- **2026-11-09**: Preparado para publicarse como código abierto y autoalojable: los datos de la instalación del dueño salen a `CLAUDE.local.md` y `deploy/private/` (ignorados), `docker-compose.yml` con Caddy opcional, `web/Dockerfile`, script del webhook de Zernio, README, guía de autoalojamiento, CI y archivos de comunidad.
