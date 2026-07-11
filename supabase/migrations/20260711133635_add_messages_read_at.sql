-- Statut lu / non lu sur la messagerie --------------------------------------
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
