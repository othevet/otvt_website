-- Pièces jointes dans la messagerie (PDF + images, 10 Mo max) ---------------

alter table messages alter column body drop not null;
alter table messages add column attachment_path text;
alter table messages add column attachment_name text;
alter table messages add column attachment_mime text;
alter table messages add constraint messages_body_or_attachment
  check (body is not null or attachment_path is not null);

-- allowed_mime_types et file_size_limit sont appliqués côté Storage, pas
-- seulement par l'attribut "accept" du <input> côté client.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760, -- 10 Mo
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Contrairement au bucket "invoices" (où seul Olivier écrit), le client
-- doit pouvoir lire ET écrire dans son propre dossier : les deux sens du
-- chat peuvent joindre un fichier. Une seule policy select par rôle
-- suffit pour les deux sens de lecture puisqu'on raisonne par client_id
-- (dossier), pas par expéditeur du fichier.

create policy "client reads own message attachments" on storage.objects
  for select
  using (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1]::uuid in (
      select id from clients where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "client uploads own message attachments" on storage.objects
  for insert
  with check (
    bucket_id = 'message-attachments'
    and (storage.foldername(name))[1]::uuid in (
      select id from clients where lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

create policy "admin full access message attachments" on storage.objects
  for all
  using (
    bucket_id = 'message-attachments'
    and lower(auth.jwt() ->> 'email') = 'contact@otvt.fr'
  )
  with check (
    bucket_id = 'message-attachments'
    and lower(auth.jwt() ->> 'email') = 'contact@otvt.fr'
  );
