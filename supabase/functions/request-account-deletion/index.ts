// Appelée par le client (compte.astro / en/account.astro) quand il clique
// "Demander la suppression de mon compte". Envoie un email à Olivier via
// Resend, plutôt que Web3Forms — remplace Web3Forms pour cette seule
// notification car son filtre anti-spam (plan gratuit, non désactivable)
// classait systématiquement ces demandes en spam.
//
// verify_jwt = false (voir config.toml), même raison que
// log-login-device : appelée depuis le navigateur, la requête préliminaire
// OPTIONS n'a pas d'Authorization, donc verify_jwt=true la ferait rejeter
// avant même d'atteindre le handler OPTIONS. Le JWT est vérifié
// manuellement ici via getUser() — tout aussi strict, juste déplacé au
// niveau applicatif. Le nom/email viennent de la table clients associée à
// ce JWT vérifié, jamais d'un paramètre fourni par l'appelant.
//
// Secrets requis (supabase secrets set ...) : RESEND_API_KEY (déjà utilisé
// par notify-client-message / log-login-device). SUPABASE_URL /
// SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY sont injectées
// automatiquement par la plateforme.

import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();

  if (!user?.email) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders });
  }
  const email = user.email.toLowerCase();

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('email', email)
    .maybeSingle();

  if (!client) {
    return new Response('no client profile', { status: 404, headers: corsHeaders });
  }

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'OTVT <contact@otvt.fr>',
      to: 'contact@otvt.fr',
      reply_to: email,
      subject: `Demande de suppression RGPD — ${client.name}`,
      html: `<p>Le client <strong>${client.name}</strong> (${email}) demande la suppression de son compte et de ses données depuis son espace client.</p>`,
    }),
  });

  if (!emailResponse.ok) {
    const errorText = await emailResponse.text();
    return new Response(`resend error: ${errorText}`, {
      status: 502,
      headers: corsHeaders,
    });
  }

  return new Response('deletion request sent', {
    status: 200,
    headers: corsHeaders,
  });
});
