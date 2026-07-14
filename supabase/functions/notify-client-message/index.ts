// Déclenché par un trigger Postgres (via pg_net, voir la migration
// notify_client_message_trigger) sur "insert" dans la table messages.
// Envoie un email au client via Resend quand Olivier répond depuis /admin
// (les messages du client vers Olivier restent notifiés côté client par
// le Web3Forms existant dans compte.astro).
//
// Secrets requis (supabase secrets set ...) : RESEND_API_KEY.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement
// par la plateforme, pas besoin de les définir.
//
// verify_jwt=false (voir config.toml) : l'appelant est un trigger interne
// à la base, pas un client public. Risque résiduel accepté : deviner un
// client_id (UUID) au hasard pour déclencher un email générique non
// sensible.

import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type MessageRecord = {
  id: string;
  client_id: string;
  sender: 'client' | 'olivier';
  body: string;
};

Deno.serve(async (req) => {
  let payload: { record?: unknown };
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const record = payload.record as MessageRecord | undefined;

  if (
    !record ||
    typeof record.client_id !== 'string' ||
    record.sender !== 'olivier'
  ) {
    return new Response('skip', { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: client } = await supabase
    .from('clients')
    .select('name, email')
    .eq('id', record.client_id)
    .maybeSingle();

  if (!client) {
    return new Response('client not found', { status: 200 });
  }

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'OTVT <contact@otvt.fr>',
      to: client.email,
      subject: 'Nouveau message dans votre espace client OTVT',
      html: `<p>Bonjour ${client.name},</p><p>Olivier vous a répondu dans votre espace client.</p><p><a href="https://www.otvt.fr/compte">Voir le message</a></p>`,
    }),
  });

  if (!emailResponse.ok) {
    const errorText = await emailResponse.text();
    return new Response(`resend error: ${errorText}`, { status: 502 });
  }

  return new Response('ok', { status: 200 });
});
