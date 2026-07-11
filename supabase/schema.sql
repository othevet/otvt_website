-- Espace client otvt.fr — schéma Supabase
--
-- À exécuter une fois dans le SQL Editor du projet Supabase (région UE
-- recommandée). Les clients/projets/factures sont ensuite gérés à la main
-- depuis le Table Editor et le Storage — ce script ne fait que poser la
-- structure et les règles d'accès (Row Level Security).
--
-- Principe : un client est identifié par son email (celui utilisé pour se
-- connecter par lien magique). Les policies comparent cet email à
-- auth.jwt() ->> 'email', donc aucune liaison manuelle d'UUID n'est requise
-- après la première connexion.

create table clients (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  project_id uuid references projects (id) on delete set null,
  file_path text not null, -- chemin dans le bucket "invoices", ex: '<client_id>/2026-01-facture-003.pdf'
  label text not null, -- ex: "Facture n°003"
  amount numeric(10, 2),
  issued_date date not null,
  created_at timestamptz not null default now()
);

-- Row Level Security -----------------------------------------------------

alter table clients enable row level security;
alter table projects enable row level security;
alter table invoices enable row level security;

-- Un client ne voit que sa propre ligne.
create policy "client reads own row" on clients
  for select
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Projets et factures : visibles uniquement s'ils appartiennent au client
-- dont l'email correspond à la session connectée. Aucune écriture n'est
-- autorisée côté client sur ces tables — tout se gère depuis le Table
-- Editor, qui utilise la clé service_role et contourne RLS.
create policy "client reads own projects" on projects
  for select
  using (
    client_id in (
      select id from clients where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "client reads own invoices" on invoices
  for select
  using (
    client_id in (
      select id from clients where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Storage: factures ------------------------------------------------------
-- Bucket privé. Organiser les fichiers en dossiers par client :
--   <client_id>/2026-01-facture-003.pdf
-- Le premier segment du chemin doit être l'UUID exact de clients.id.

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

create policy "client reads own invoice files" on storage.objects
  for select
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1]::uuid in (
      select id from clients where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Messagerie client <-> Olivier -------------------------------------------
--
-- Un fil de discussion par client. "sender" distingue les messages envoyés
-- par le client de ceux envoyés par Olivier depuis /admin.

create table messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  sender text not null check (sender in ('client', 'olivier')),
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_client_id_created_at_idx
  on messages (client_id, created_at);

alter table messages enable row level security;

-- Un client voit tous les messages de son propre fil.
create policy "client reads own messages" on messages
  for select
  using (
    client_id in (
      select id from clients where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Un client ne peut écrire QUE dans son propre fil, et uniquement en tant
-- que "client" : impossible d'usurper l'identité d'Olivier ou d'écrire dans
-- le fil d'un autre client (les deux conditions sont dans le MÊME
-- with check, pas deux policies séparées, sinon Postgres les combine par OR
-- et l'une des deux garanties pourrait être contournée).
create policy "client sends own messages" on messages
  for insert
  with check (
    sender = 'client'
    and client_id in (
      select id from clients where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Back-office : accès complet pour Olivier depuis /admin -------------------
--
-- Ces policies s'ajoutent aux policies clients ci-dessus sans les modifier :
-- Postgres combine plusieurs policies permissives par OR pour une même
-- action, donc l'accès admin vient en plus, jamais à la place, de l'accès
-- client existant. "for all" couvre select/insert/update/delete en une
-- seule policy (using s'applique à select/update/delete, with check à
-- insert/update).
--
-- L'email de comparaison est écrit en dur, en minuscules, dans le SQL — il
-- n'est jamais transmis ni modifiable depuis le client.

create policy "admin full access clients" on clients
  for all
  using (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr')
  with check (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr');

create policy "admin full access projects" on projects
  for all
  using (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr')
  with check (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr');

create policy "admin full access invoices" on invoices
  for all
  using (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr')
  with check (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr');

create policy "admin full access messages" on messages
  for all
  using (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr')
  with check (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr');

create policy "admin full access invoice files" on storage.objects
  for all
  using (
    bucket_id = 'invoices'
    and lower(auth.jwt() ->> 'email') = 'contact@otvt.fr'
  )
  with check (
    bucket_id = 'invoices'
    and lower(auth.jwt() ->> 'email') = 'contact@otvt.fr'
  );

-- Realtime (optionnel) ------------------------------------------------------
-- Pour que les nouveaux messages apparaissent en direct sans recharger la
-- page, activer le toggle "Enable Realtime" sur la table messages dans le
-- dashboard Supabase, ou décommenter la ligne suivante :
-- alter publication supabase_realtime add table messages;

-- Statut lu / non lu --------------------------------------------------------
--
-- read_at est renseigné par le destinataire quand il consulte le fil (le
-- client marque comme lus les messages d'Olivier, et inversement depuis
-- /admin qui a déjà un accès complet via sa policy "for all").

alter table messages add column read_at timestamptz;

-- Un client peut marquer comme lus les messages d'Olivier dans son propre
-- fil, mais seulement la colonne read_at : on retire d'abord le droit
-- d'update général (accordé implicitement par Supabase), puis on ne
-- l'accorde que sur cette colonne. Sans ça, la policy RLS seule ne
-- l'empêcherait pas de réécrire le contenu ("body") des messages d'Olivier.
revoke update on messages from authenticated;
grant update (read_at) on messages to authenticated;

create policy "client marks olivier messages read" on messages
  for update
  using (
    sender = 'olivier'
    and client_id in (
      select id from clients where lower(email) = lower(auth.jwt() ->> 'email')
    )
  )
  with check (
    sender = 'olivier'
    and client_id in (
      select id from clients where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );
