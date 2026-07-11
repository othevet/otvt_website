-- Notifie le client par email quand Olivier répond, en appelant la Edge
-- Function notify-client-message via pg_net (async, ne bloque pas
-- l'insertion). La fonction elle-même ignore les messages dont
-- sender != 'olivier' (ceux du client sont déjà notifiés côté Web3Forms).

create or replace function notify_client_message_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://quylkiyusujqkluhhwgs.supabase.co/functions/v1/notify-client-message',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'messages',
      'record', row_to_json(new)
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

create trigger notify_client_message_trigger
  after insert on messages
  for each row
  execute function notify_client_message_webhook();
