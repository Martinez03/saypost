# Contrato web ↔ backend

Esquema de datos: `supabase/migrations/20261109150000_init.sql`.

## Qué lee la web directamente de Supabase (con la sesión del usuario, RLS)
| Tabla | Para qué |
|---|---|
| `businesses` | El negocio del usuario (uno por usuario). La web lo **crea** en el onboarding (`owner_id`, `name`, `category`, `city`, `description`, `tone`, `language`, `timezone`) y **edita** los campos de perfil y avisos (`notes`, `notify_*` incluidos). Los campos de WhatsApp y Zernio solo los escribe el backend. |
| `social_accounts` | Cuentas conectadas (`platform`, `username`, `display_name`, `profile_picture`, `status`). Solo lectura. |
| `messages` | La conversación de WhatsApp entre el dueño y Dilo (`direction` in/out, `kind`, `body`, `media_url`). Solo lectura. |
| `actions` | Acciones que esperan un "sí" o ya decididas (`kind`, `status`, `title`, `preview`, `context`, `error`). Solo lectura: aprobar o rechazar pasa por el backend. |
| `events` | Actividad para el inicio del dashboard (`type`, `title`, `data`, `created_at`). Solo lectura. |

`tone`: `friendly` | `professional` | `fun` | `elegant`. `language`: `es` | `en`.

## Endpoints del backend (`NEXT_PUBLIC_API_URL`)
Todos los `/api/*` llevan `Authorization: Bearer <access_token de Supabase>`. El backend busca el negocio del usuario; si no tiene, responde `404 {"error":"no_business"}`. Errores: `{"error": "<código>", "message": "<texto>"}`.

| Método y ruta | Cuerpo | Respuesta | Qué hace |
|---|---|---|---|
| `GET /health` | | `{ok:true}` | |
| `POST /api/connect` | `{platform}` | `{authUrl}` | Crea el perfil de Zernio si falta y devuelve la URL para conectar la red. La web redirige a `authUrl`; Zernio vuelve a `<WEB_URL>/app/accounts?connected=<platform>`. |
| `POST /api/accounts/sync` | | `{accounts: SocialAccount[]}` | Trae de Zernio las cuentas del perfil y actualiza `social_accounts`. La web lo llama al volver de conectar. |
| `DELETE /api/accounts/:id` | | `{ok:true}` | Desconecta una cuenta (`id` = `social_accounts.id`). |
| `POST /api/whatsapp/activate` | `{phone}` | `{status, sandboxNumber, phone}` | Guarda el móvil del dueño e inicia la activación en el sandbox de WhatsApp de Zernio (le llega una plantilla que tiene que contestar). |
| `GET /api/whatsapp/status` | | `{status, sandboxNumber, phone}` | `inactive` / `pending` (falta contestar la plantilla) / `active`. |
| `GET /api/posts` | | `{posts: Post[]}` | Últimos posts y programados del perfil en Zernio. `Post = {id, content, status, scheduledFor, publishedAt, platforms: [{platform, status, url}], mediaUrl}` |
| `GET /api/stats` | | `{accounts, postsLast7d, pendingActions, reviews: {total, unanswered, averageRating}}` | Números para las tarjetas del inicio. Cada campo puede venir `null` si Zernio no lo da. |
| `POST /api/actions/:id/approve` | | `{action}` | Ejecuta una acción pendiente (publicar, responder…) y la devuelve con su nuevo estado. |
| `POST /api/actions/:id/reject` | | `{action}` | La descarta. |
| `POST /webhooks/zernio` | (Zernio) | `200` | Webhooks firmados de Zernio. |

Plataformas que la web ofrece conectar: `instagram`, `facebook`, `googlebusiness`, `linkedin`, `tiktok`, `twitter` (X), `threads`, `bluesky`, `youtube`, `pinterest`.

## Flujos
1. **Alta:** registro → onboarding (crea `businesses`) → conectar redes (`/api/connect`) → activar WhatsApp (`/api/whatsapp/activate`) → el dueño contesta la plantilla y escribe "hola" a Dilo.
2. **El dueño escribe a Dilo** (`message.received` de WhatsApp): audio → transcripción; foto → se sube a Zernio; Claude decide. Si quiere publicar o responder, crea una `action` pendiente y manda la vista previa con botones "Sí / No". El "sí" ejecuta en código.
3. **Algo pasa en sus redes** (`review.new`, `comment.received`, DMs de IG/FB, reseñas de Facebook por sondeo): Claude redacta la respuesta, se crea una `action` pendiente y se avisa al dueño por WhatsApp.
4. **Dashboard:** las mismas acciones se pueden aprobar o rechazar desde `/app/approvals`.
