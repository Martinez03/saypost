# Contrato web ↔ backend

Esquema de datos: `supabase/migrations/20261109150000_init.sql`, `20261109180000_workspaces.sql` (agencias) y `20261109210000_invites.sql` (invitaciones a clientes, tipo y marca del workspace).

## Workspaces (agencias)
Cada negocio vive en un **workspace** (`workspaces`, `workspace_members` con rol `owner` | `member`). Todos los miembros de un workspace ven y gestionan todos sus negocios (RLS por pertenencia). Un negocio local suelto es un workspace con un solo negocio; una agencia es un workspace con muchos. `businesses.owner_id` ahora significa "creado por" y un usuario puede crear varios negocios.

- Un `insert` en `businesses` sin `workspace_id` va al primer workspace del que el usuario es `owner`, o a uno nuevo con el nombre del negocio (trigger `businesses_default_workspace`): el onboarding de siempre sigue funcionando.
- La web no crea workspaces ni miembros (solo los lee); los crea el trigger o el backend.
- `workspaces.kind`: `business` (por defecto; un negocio, el panel de siempre) o `agency`. Con `agency`, o con más de un negocio, el panel muestra "Clientes", el selector de negocio y, en el Inicio, "Invita a tu cliente" como primer paso.
- `workspaces.brand_name` (1 a 60 caracteres) y `logo_url` (solo `https://`): la marca de la agencia que ven sus clientes en la página de invitación y en la pantalla de bienvenida de Zernio. Solo los `owner` del workspace pueden cambiarla (RLS y columnas concedidas); la web lo hace por `PATCH /api/workspace`.
- `businesses.approval_mode`:
  - `owner_whatsapp` (por defecto): el dueño recibe cada propuesta con botones Sí / No y puede decir "sí"; también se aprueba en el dashboard.
  - `agency_dashboard`: solo aprueba el dashboard. Lo que pide el dueño por WhatsApp recibe una sola nota fija ("Recibido 👍 Tu agencia lo revisa…"); reseñas, comentarios y DMs van solo al dashboard; un "sí" o un botón antiguo del dueño no aprueba nada. Al ejecutarse, el dueño recibe el resultado ("✅ Publicado…") de lo que pidió él, no de las respuestas que nunca vio. La decisión está en `backend/src/approval.ts`.

## Qué lee la web directamente de Supabase (con la sesión del usuario, RLS)
| Tabla | Para qué |
|---|---|
| `businesses` | Los negocios de los workspaces del usuario. La web **crea** el primero en el onboarding (`owner_id`, `name`, `category`, `city`, `description`, `tone`, `language`, `timezone`; admite `workspace_id` y `approval_mode`) y **edita** los campos de perfil, avisos (`notes`, `notify_*` incluidos) y `approval_mode`. Los campos de WhatsApp y Zernio (y `workspace_id`) solo los escribe el backend. El negocio que se está viendo va en la cookie `biz` (si falta o no es suyo, el primero por `created_at`). |
| `workspaces`, `workspace_members` | Los workspaces del usuario (`kind`, `brand_name`, `logo_url`) y sus miembros. Solo lectura, salvo `brand_name` y `logo_url` para los `owner`. |
| `invites` | Enlaces de invitación de los negocios del usuario (`id`, `business_id`, `created_by`, `expires_at`, `revoked_at`, `created_at`, `last_used_at`). Solo lectura y sin `token_hash`; crear y revocar pasa por el backend. |
| `social_accounts` | Cuentas conectadas (`platform`, `username`, `display_name`, `profile_picture`, `status`). Solo lectura. |
| `messages` | La conversación de WhatsApp entre el dueño y Saypost (`direction` in/out, `kind`, `body`, `media_url`). Solo lectura. |
| `actions` | Acciones que esperan un "sí" o ya decididas (`kind`, `status`, `title`, `preview`, `context`, `error`). Solo lectura: aprobar o rechazar pasa por el backend. |
| `events` | Actividad para el inicio del dashboard (`type`, `title`, `data`, `created_at`). Solo lectura. |

`tone`: `friendly` | `professional` | `fun` | `elegant`. `language`: `es` | `en`.

## Endpoints del backend (`NEXT_PUBLIC_API_URL`)
Todos los `/api/*` llevan `Authorization: Bearer <access_token de Supabase>` y, opcionalmente, `X-Business-Id: <id del negocio>`. El negocio tiene que estar en uno de los workspaces del usuario (si no, `403 {"error":"forbidden_business"}`); sin cabecera se usa el primero por `created_at`, y si no tiene ninguno, `404 {"error":"no_business"}`. Errores: `{"error": "<código>", "message": "<texto>"}`.

| Método y ruta | Cuerpo | Respuesta | Qué hace |
|---|---|---|---|
| `GET /health` | | `{ok:true}` | |
| `GET /api/businesses` | | `{businesses: [{id, name, category, city, language, workspaceId, approvalMode, whatsappStatus, connectedAccounts, pendingActions}]}` | Los negocios de los workspaces del usuario con un resumen. No necesita negocio ni cabecera. |
| `POST /api/businesses` | `{name, category?, city?, description?, tone?, language?, timezone?, approval_mode?, workspace_id?}` | `201 {business}` | Crea un negocio (cliente) en un workspace del usuario (`workspace_id` o el primero; si no tiene, crea uno). `403 forbidden_workspace` si el workspace no es suyo. |
| `POST /api/workspace` | `{kind: "business"\|"agency", brand_name?, logo_url?}` | `{workspace: {id, name, kind, brandName, logoUrl}}` (`201` si lo crea) | Onboarding ("¿Para tu negocio o eres una agencia?"). Fija el tipo y la marca del primer workspace del que el usuario es `owner`, o lo crea. Con `agency`, `brand_name` es obligatorio y pasa a ser también el nombre del workspace. No necesita negocio. `400 bad_kind`, `bad_name`, `bad_logo_url`. |
| `PATCH /api/workspace` | `{brand_name?, logo_url?, kind?}` | `{workspace}` | Ajustes: cambia la marca (y el tipo) del workspace del negocio de `X-Business-Id`. Solo `owner` (`403 forbidden_workspace`). `null` o `""` borra el campo. |
| `POST /api/invites` | | `201 {id, url, expiresAt}` | Crea un enlace de invitación para el negocio: `url` = `<WEB_URL>/invite/<token>`, con un token de 32 bytes aleatorios en base64url. **El token solo se devuelve aquí**: en la base solo queda su SHA-256. Caduca a los 14 días. |
| `GET /api/invites` | | `{invites: [{id, createdAt, expiresAt, lastUsedAt}]}` | Los enlaces activos (ni revocados ni caducados) del negocio, sin tokens. |
| `DELETE /api/invites/:id` | | `{ok:true}` | Revoca el enlace (`404` si no es de ese negocio o ya estaba revocado). |
| `POST /api/connect` | `{platform}` | `{authUrl}` | Crea el perfil de Zernio si falta y devuelve la URL para conectar la red. La web redirige a `authUrl`; Zernio vuelve a `<WEB_URL>/app/accounts?connected=<platform>`. |
| `POST /api/accounts/sync` | | `{accounts: SocialAccount[]}` | Trae de Zernio las cuentas del perfil y actualiza `social_accounts`. La web lo llama al volver de conectar. |
| `DELETE /api/accounts/:id` | | `{ok:true}` | Desconecta una cuenta (`id` = `social_accounts.id`). |
| `POST /api/whatsapp/activate` | `{phone}` | `{status, sandboxNumber, phone}` | Guarda el móvil del dueño e inicia la activación en el sandbox de WhatsApp de Zernio (le llega una plantilla que tiene que contestar). |
| `GET /api/whatsapp/status` | | `{status, sandboxNumber, phone}` | `inactive` / `pending` (falta contestar la plantilla) / `active`. |
| `GET /api/posts` | | `{posts: Post[]}` | Últimos posts y programados del perfil en Zernio. `Post = {id, content, status, scheduledFor, publishedAt, platforms: [{platform, status, url}], mediaUrl}` |
| `GET /api/stats` | | `{accounts, postsLast7d, pendingActions, reviews: {total, unanswered, averageRating}}` | Números para las tarjetas del inicio. Cada campo puede venir `null` si Zernio no lo da. |
| `POST /api/actions/:id/approve` | | `{action}` | Ejecuta una acción pendiente (publicar, responder…) y la devuelve con su nuevo estado. Vale cualquier negocio de los workspaces del usuario, no solo el de `X-Business-Id` (aprobaciones unificadas). |
| `POST /api/actions/:id/reject` | | `{action}` | La descarta (mismo alcance). |
| `POST /webhooks/zernio` | (Zernio) | `200` | Webhooks firmados de Zernio. |

### Endpoints públicos de la invitación (sin sesión)
Para la página `/invite/<token>` de la web. La única llave es el token. Un token desconocido, mal formado, caducado o revocado recibe siempre `404 {"error":"not_found"}`, sin más detalle. Límite de 40 peticiones por minuto e IP (`429 {"error":"rate_limited"}` con `Retry-After`). Respuestas con `Cache-Control: no-store` y `Referrer-Policy: no-referrer`. Cada uso actualiza `invites.last_used_at`.

| Método y ruta | Cuerpo | Respuesta | Qué hace |
|---|---|---|---|
| `GET /public/invites/:token` | | `{businessName, brandName, logoUrl, language, platforms: [{platform, connected, username}]}` | Lo único que ve el cliente: el nombre y el idioma del negocio, la marca de la agencia y qué redes tiene conectadas. Nada de ids, teléfonos ni datos de Zernio. |
| `POST /public/invites/:token/connect` | `{platform}` | `{authUrl}` | Crea el perfil de Zernio si falta y devuelve la URL para conectar la red, con la pantalla de bienvenida de Zernio (`welcome=true`, `brandName` = marca de la agencia o "Saypost", `logoUrl` si es https, `primaryColor`). Zernio vuelve a `<WEB_URL>/invite/<token>?connected=<platform>` (y añade `accountId`, `username`; o `error` y `platform` si falla). `400 bad_platform`, `502 connect_failed`. |
| `POST /public/invites/:token/sync` | `{platform?, accountId?}` | `{platforms}` | Sincroniza las cuentas del negocio con Zernio (si Zernio falla, devuelve las que ya hay) y, si viene `platform`, apunta en la actividad "Tu cliente conectó X desde la invitación" (`events.type = invite.connected`, una vez por cuenta). |

Plataformas que la web ofrece conectar: `instagram`, `facebook`, `googlebusiness`, `linkedin`, `tiktok`, `twitter` (X), `threads`, `bluesky`, `youtube`, `pinterest`.

## Flujos
1. **Alta:** registro → onboarding (crea `businesses`) → conectar redes (`/api/connect`) → activar WhatsApp (`/api/whatsapp/activate`) → el dueño contesta la plantilla y escribe "hola" a Saypost.
2. **El dueño escribe a Saypost** (`message.received` de WhatsApp): audio → transcripción; foto → se sube a Zernio; Claude decide. Si quiere publicar o responder, crea una `action` pendiente y manda la vista previa con botones "Sí / No". El "sí" ejecuta en código.
3. **Algo pasa en sus redes** (`review.new`, `comment.received`, DMs de IG/FB, reseñas de Facebook por sondeo): Claude redacta la respuesta, se crea una `action` pendiente y se avisa al dueño por WhatsApp.
4. **Dashboard:** las mismas acciones se pueden aprobar o rechazar desde `/app/approvals`. Con más de un negocio, se ven las de todos con su cliente y un filtro.
5. **Agencia:** en el onboarding elige "Soy una agencia" (nombre y logo, `POST /api/workspace`) → "Añade tu primer cliente" (`POST /api/businesses`) → el panel cambia a ese negocio (cookie `biz`). Más clientes desde "Añadir cliente" (`/app/clients/new`). El selector de la barra lateral y `/app/clients` aparecen en los workspaces `agency` o con más de un negocio.
6. **Invitación al cliente:** la agencia pulsa "Invitar al cliente" (Inicio, Cuentas o la tarjeta de `/app/clients`) → `POST /api/invites` → copia el enlace o lo manda por WhatsApp (`wa.me` al móvil del dueño si lo tiene) o email → el cliente abre `/invite/<token>` en su móvil, sin cuenta → "Conectar" (`/public/invites/:token/connect`) → entra en la red con su usuario → vuelve con `?connected=` → `/public/invites/:token/sync` → la agencia lo ve en Cuentas y en la actividad. Después, la agencia activa su WhatsApp y el cliente solo usa WhatsApp.
