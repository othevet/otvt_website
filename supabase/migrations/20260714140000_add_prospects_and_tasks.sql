-- Prospects (pipeline commercial) et tâches internes -----------------------
--
-- Deux tables strictement internes à l'admin : aucune policy client, jamais
-- exposées côté espace client. Contrairement à clients/projects/invoices,
-- il n'y a donc qu'une seule policy "admin full access" par table, pas de
-- policy "client reads own ..." en plus.

create table prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  status text not null default 'a_contacter'
    check (status in ('a_contacter', 'en_discussion', 'devis_envoye', 'gagne', 'perdu')),
  notes text,
  next_follow_up date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table prospects enable row level security;

create policy "admin full access prospects" on prospects
  for all
  using (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr')
  with check (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr');

-- Tâches internes, liées à un projet -----------------------------------------
--
-- Le client voit le statut global du projet (En cours / Terminé) dans son
-- espace, mais jamais le détail des tâches — table entièrement invisible
-- côté client, comme prospects ci-dessus. "on delete cascade" : supprimer
-- un projet (ou son client, qui cascade déjà sur projects) supprime aussi
-- ses tâches, même logique que invoices/messages.

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_date date,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_project_id_idx on tasks (project_id);

alter table tasks enable row level security;

create policy "admin full access tasks" on tasks
  for all
  using (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr')
  with check (lower(auth.jwt() ->> 'email') = 'contact@otvt.fr');
