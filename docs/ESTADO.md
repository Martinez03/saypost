# Estado de Saypost

Actualizado: 2026-11-09, noche.

El estado de la instalación del dueño (servidor, dominios, proyecto de Supabase, cuentas de Zernio conectadas y lo que falta allí) está en `CLAUDE.local.md`, que no se publica.

## Qué hay
- **Nombre**: Saypost (antes Dilo; renombrado el 2026-11-09). Se quedan con el nombre antiguo, a propósito, el usuario de prueba `demo@dilo.test` y los identificadores de la instalación del dueño que están en producción (anotados en `CLAUDE.local.md`).
- **Supabase**: tres migraciones: `20261109150000_init.sql` (esquema y RLS), `20261109180000_workspaces.sql` (workspaces para agencias, modo de aprobación y RLS por pertenencia, con backfill: un workspace por negocio existente) y `20261109210000_invites.sql` (invitaciones a clientes con el token guardado como SHA-256, `workspaces.kind` y la marca de la agencia). Auth con email y contraseña.
- **Backend** (`backend/`): webhooks firmados de Zernio con deduplicación, agente de WhatsApp con Claude, borradores de respuestas a reseñas, comentarios y DMs, sondeo de reseñas de Facebook, transcripción de audios con OpenAI y endpoints del dashboard. CORS: `WEB_URL` más `WEB_ORIGINS` (admite `*`, p. ej. para las *deploy previews* de Netlify).
- **Agente**: publicar y programar, responder reseñas, comentarios y DMs, cancelar posts, recordar datos y métricas. Todo lo que publica o responde espera el "sí" (botón o texto) o la aprobación en el dashboard.
- **Web** (`web/`): landing bilingüe, registro, login, onboarding y dashboard (Inicio, Aprobaciones, Publicaciones, Cuentas, WhatsApp, Ajustes).
- **Modo agencia**: un usuario puede llevar varios negocios (un workspace con varios). Con más de uno aparecen el selector de negocio en la barra lateral, "Clientes" (`/app/clients`, con resumen) y las aprobaciones de todos con filtro por cliente; con uno solo, nada cambia salvo "Añadir otro negocio" en el menú de la cuenta. Cada negocio elige quién aprueba en Ajustes: el dueño por WhatsApp (lo de siempre) o la agencia desde el panel (el dueño no recibe botones ni puede aprobar; recibe "Tu agencia lo revisa" y luego el resultado). Los `/api/*` actúan sobre `X-Business-Id`.
- **Invitación al cliente**: la agencia crea un enlace (`/invite/<token>`, caduca a los 14 días, se puede revocar) y el cliente conecta sus redes desde el móvil, sin cuenta y sin dar contraseñas, con la pantalla de bienvenida de Zernio con la marca de la agencia. Página pública bilingüe (sigue el idioma del negocio, con selector), mobile first. Endpoints públicos sin sesión con límite por IP. Al volver, la conexión aparece en Cuentas y en la actividad ("Tu cliente conectó…").
- **Onboarding**: primer paso "¿Es para tu negocio o eres una agencia?". Negocio: el alta de siempre. Agencia: nombre y logo, y luego "Añade tu primer cliente". Los workspaces `agency` ven "Clientes" y el selector aunque tengan un solo cliente, y su Inicio empieza por "Invita a tu cliente". Marca de la agencia editable en Ajustes (solo el propietario).
- **Pruebas**: `npm test` en `backend/` (firma, sí/no, conversación, vista previa, orígenes de CORS, eventos del webhook, modo de aprobación, negocio permitido por `X-Business-Id`, y las invitaciones: hash y búsqueda del token, caducidad y revocación, que los endpoints públicos no filtran nada más y el límite por IP). Simulación local de webhooks con `scripts/simulate.ts` y `scripts/inspect.ts` (negocio de prueba "Bar La Prueba", usuario `demo@dilo.test`, móvil ficticio `34600000001`).
- **Autoalojamiento**: `docker-compose.yml` en la raíz (backend + web, Caddy opcional con HTTPS), `web/Dockerfile` (`standalone`), `scripts/setup-zernio-webhook.mjs`, `docs/SELF_HOSTING.md`, CI en GitHub Actions.

## Limitaciones conocidas
- La activación de WhatsApp desde el dashboard usa el sandbox de Zernio (un móvil, 50 mensajes al día). Con un número propio de WhatsApp Business conectado a Zernio, el backend ya atiende a los dueños por su móvil, pero el botón "Activar" sigue llamando al sandbox, y los avisos fuera de la ventana de 24 h necesitarían plantillas.
- Sin confirmación de email por defecto: para abrir a usuarios hace falta SMTP propio en Supabase.
- Un solo proceso de backend: la cola por negocio vive en memoria.
- Invitaciones a clientes: el límite por IP vive en memoria (un proceso) y confía en la IP que da el proxy (`trustProxy`); detrás de Caddy es la real. El enlace no activa el WhatsApp del cliente: eso sigue en manos de la agencia (sandbox: un móvil).
- Agencias: no hay invitaciones de miembros desde la web (un workspace tiene un usuario salvo que se añada a mano en `workspace_members`), ni se puede borrar un negocio desde el panel. Cada cliente necesita su propio móvil de WhatsApp (`owner_phone` es único) y, en el sandbox de Zernio, solo cabe uno.

## Publicación
- Código abierto con licencia MIT en https://github.com/Martinez03/saypost (rama `main`, publicada el 2026-11-09 con un único commit sin historial). Se publicó como `Martinez03/dilo`; al renombrar el repo, GitHub redirige la URL antigua.

## Falta
1. Activar en GitHub los avisos privados de vulnerabilidades (Security → Private vulnerability reporting), que es a donde manda `SECURITY.md`.
2. Activación de WhatsApp con número propio desde el dashboard, plantillas para avisos fuera de la ventana de 24 h.
3. Confirmación de email con SMTP propio y planes de pago.
4. Agencias: invitar miembros al workspace, borrar o archivar clientes, informe semanal por cliente.
