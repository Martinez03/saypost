# Contrato web ↔ backend

Esquema de datos: `supabase/migrations/20261109150000_init.sql` y `20261109180000_workspaces.sql` (agencias).

## Workspaces (agencias)
Cada negocio vive en un **workspace** (`workspaces`, `workspace_members` con rol `owner` | `member`). Todos los miembros de un workspace ven y gestionan todos sus negocios (RLS por pertenencia). Un negocio local suelto es un workspace con un solo negocio; una agencia es un workspace con muchos. `businesses.owner_id` ahora significa "creado por" y un usuario puede crear varios negocios.

- Un `insert` en `businesses` sin `workspace_id` va al primer workspace del que el usuario es `owner`, o a uno nuevo con el nombre del negocio (trigger `businesses_default_workspace`): el onboarding de siempre sigue funcionando.
- La web no crea workspaces ni miembros (solo los lee); los crea el trigger o el backend.
- `businesses.approval_mode`:
  - `owner_whatsapp` (por defecto): el dueño recibe cada propuesta con botones Sí / No y puede decir "sí"; también se aprueba en el dashboard.
  - `agency_dashboard`: solo aprueba el dashboard. Lo que pide el dueño por WhatsApp recibe una sola nota fija ("Recibido 👍 Tu agencia lo revisa…"); reseñas, comentarios y DMs van solo al dashboard; un "sí" o un botón antiguo del dueño no aprueba nada. Al ejecutarse, el dueño recibe el resultado ("✅ Publicado…") de lo que pidió él, no de las respuestas que nunca vio. La decisión está en `backend/src/approval.ts`.

## Qué lee la web directamente de Supabase (con la sesión del usuario, RLS)
| Tabla | Para qué |
|---|---|
| `businesses` | Los negocios de los workspaces del usuario. La web **crea** el primero en el onboarding (`owner_id`, `name`, `category`, `city`, `description`, `tone`, `language`, `timezone`; admite `workspace_id` y `approval_mode`) y **edita** los campos de perfil, avisos (`notes`, `notify_*` incluidos) y `approval_mode`. Los campos de WhatsApp y Zernio (y `workspace_id`) solo los escribe el backend. El negocio que se está viendo va en la cookie `biz` (si falta o no es suyo, el primero por `created_at`). |
| `workspaces`, `workspace_members` | Solo lectura: los workspaces del usuario y sus miembros. |
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

Plataformas que la web ofrece conectar: `instagram`, `facebook`, `googlebusiness`, `linkedin`, `tiktok`, `twitter` (X), `threads`, `bluesky`, `youtube`, `pinterest`.

## Flujos
1. **Alta:** registro → onboarding (crea `businesses`) → conectar redes (`/api/connect`) → activar WhatsApp (`/api/whatsapp/activate`) → el dueño contesta la plantilla y escribe "hola" a Saypost.
2. **El dueño escribe a Saypost** (`message.received` de WhatsApp): audio → transcripción; foto → se sube a Zernio; Claude decide. Si quiere publicar o responder, crea una `action` pendiente y manda la vista previa con botones "Sí / No". El "sí" ejecuta en código.
3. **Algo pasa en sus redes** (`review.new`, `comment.received`, DMs de IG/FB, reseñas de Facebook por sondeo): Claude redacta la respuesta, se crea una `action` pendiente y se avisa al dueño por WhatsApp.
4. **Dashboard:** las mismas acciones se pueden aprobar o rechazar desde `/app/approvals`. Con más de un negocio, se ven las de todos con su cliente y un filtro.
5. **Agencia:** "Añadir cliente" (`/app/clients/new`, `POST /api/businesses`) → el panel cambia a ese negocio (cookie `biz`) → conectar sus redes y su WhatsApp como en el alta. El selector de la barra lateral y `/app/clients` solo aparecen con más de un negocio.
