# Estado de Dilo

Actualizado: 2026-11-09, noche.

El estado de la instalación del dueño (servidor, dominios, proyecto de Supabase, cuentas de Zernio conectadas y lo que falta allí) está en `CLAUDE.local.md`, que no se publica.

## Qué hay
- **Supabase**: una migración (`supabase/migrations/20261109150000_init.sql`) con el esquema y RLS. Auth con email y contraseña.
- **Backend** (`backend/`): webhooks firmados de Zernio con deduplicación, agente de WhatsApp con Claude, borradores de respuestas a reseñas, comentarios y DMs, sondeo de reseñas de Facebook, transcripción de audios con OpenAI y endpoints del dashboard. CORS: `WEB_URL` más `WEB_ORIGINS` (admite `*`, p. ej. para las *deploy previews* de Netlify).
- **Agente**: publicar y programar, responder reseñas, comentarios y DMs, cancelar posts, recordar datos y métricas. Todo lo que publica o responde espera el "sí" (botón o texto) o la aprobación en el dashboard.
- **Web** (`web/`): landing bilingüe, registro, login, onboarding y dashboard (Inicio, Aprobaciones, Publicaciones, Cuentas, WhatsApp, Ajustes).
- **Pruebas**: `npm test` en `backend/` (firma, sí/no, conversación, vista previa, orígenes de CORS, eventos del webhook). Simulación local de webhooks con `scripts/simulate.ts` y `scripts/inspect.ts` (negocio de prueba "Bar La Prueba", usuario `demo@dilo.test`, móvil ficticio `34600000001`).
- **Autoalojamiento**: `docker-compose.yml` en la raíz (backend + web, Caddy opcional con HTTPS), `web/Dockerfile` (`standalone`), `scripts/setup-zernio-webhook.mjs`, `docs/SELF_HOSTING.md`, CI en GitHub Actions.

## Limitaciones conocidas
- La activación de WhatsApp desde el dashboard usa el sandbox de Zernio (un móvil, 50 mensajes al día). Con un número propio de WhatsApp Business conectado a Zernio, el backend ya atiende a los dueños por su móvil, pero el botón "Activar" sigue llamando al sandbox, y los avisos fuera de la ventana de 24 h necesitarían plantillas.
- Sin confirmación de email por defecto: para abrir a usuarios hace falta SMTP propio en Supabase.
- Un solo proceso de backend: la cola por negocio vive en memoria.

## Falta
1. Publicar el repositorio (licencia por decidir, historial limpio).
2. Activación de WhatsApp con número propio desde el dashboard, plantillas para avisos fuera de la ventana de 24 h.
3. Confirmación de email con SMTP propio y planes de pago.
