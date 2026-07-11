-- Prérequis pour les Database Webhooks (appel HTTP asynchrone depuis un
-- trigger Postgres, utilisé pour notifier le client par email quand
-- Olivier répond).
create extension if not exists pg_net with schema extensions;
