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
