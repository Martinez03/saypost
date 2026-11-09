-- Web chat with the agent inside the dashboard.
--
-- There is still one conversation per business: the owner (or their agency) can write from WhatsApp or
-- from the dashboard chat, and the agent reads the whole thread. Each message records the channel it
-- came in on (or was answered on), so the backend answers a web message on the web only, and the
-- dashboard can mark which bubbles were WhatsApp and which were web.
--
-- Existing rows are all WhatsApp. Adding a column with a constant default does not rewrite the table.
-- RLS is unchanged: members of the business's workspace can read it (messages_select); only the
-- backend (service role) writes messages.

alter table public.messages
  add column channel text not null default 'whatsapp' check (channel in ('whatsapp', 'web'));

comment on column public.messages.channel is
  'whatsapp: the owner''s WhatsApp thread. web: the chat in the Saypost dashboard. Replies go back on the same channel.';
