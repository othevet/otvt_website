-- Journal des connexions + détection de nouvel appareil ---------------------
--
-- Alimenté uniquement par la Edge Function log-login-device (clé
-- service_role, contourne RLS), jamais en écriture directe côté client.
-- verify_jwt=true sur cette fonction (contrairement à notify-client-message)
-- : elle est appelée juste après une connexion réussie, donc une session
-- valide existe déjà — l'email vient du JWT vérifié par Supabase, jamais
-- d'un paramètre fourni par l'appelant.
--
-- "device" = hash(user-agent + ip) calculé côté fonction (pas par le
-- client) : heuristique, pas une empreinte cryptographique infalsifiable,
-- mais suffisante contre le scénario réaliste visé (quelqu'un utilise un
-- code de connexion intercepté depuis son propre navigateur normal).

create table login_events (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  device_hash text not null,
  user_agent text,
  ip text,
  is_new_device boolean not null default false,
  created_at timestamptz not null default now()
);

create index login_events_email_device_idx on login_events (email, device_hash);
create index login_events_email_created_at_idx on login_events (email, created_at);

alter table login_events enable row level security;

create policy "admin full access login events" on login_events
  for all
  using (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr')
  with check (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr');
