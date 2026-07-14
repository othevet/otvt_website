// Appelée par le client (login-flow.ts) juste après une connexion réussie
// (verifyOtp). Enregistre l'événement dans login_events et envoie un email
// via Resend si le couple (email, user-agent + IP) n'a jamais été vu — un
// signal "nouvel appareil", best-effort, pas une preuve cryptographique.
//
// verify_jwt = false (voir config.toml) — pas pour la même raison que
// notify-client-message. Cette fonction est appelée depuis le navigateur,
// qui envoie une requête préliminaire OPTIONS sans Authorization ; avec
// verify_jwt=true la plateforme rejette cette requête AVANT même
// d'atteindre le code (donc avant le handler OPTIONS ci-dessous). La
// vérification du JWT est donc faite manuellement ici via getUser() — tout
// aussi stricte (signature vérifiée par le SDK), juste déplacée du niveau
// plateforme au niveau applicatif. L'email vient de ce JWT vérifié, jamais
// d'un paramètre fourni par l'appelant : impossible de déclencher un faux
// événement/email pour quelqu'un d'autre.
//
// Secrets requis (supabase secrets set ...) : RESEND_API_KEY (déjà utilisé
// par notify-client-message). SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement par la
// plateforme.

import { createClient } from 'npm:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Contrairement à notify-client-message (appelée par un trigger Postgres,
// jamais par un navigateur), cette fonction est appelée directement depuis
// le client via supabase.functions.invoke() — le navigateur envoie donc une
// requête préliminaire OPTIONS qu'il faut gérer explicitement, sinon l'appel
// échoue avant même d'atteindre le code ci-dessous.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

async function hashDeviceKey(input: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Vérification manuelle du JWT (voir le commentaire en tête de fichier) :
  // on récupère l'email de façon fiable, jamais fourni par le corps de la
  // requête.
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

  const userAgent = req.headers.get('user-agent') ?? 'unknown';
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const deviceHash = await hashDeviceKey(`${userAgent}|${ip}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: existing } = await supabase
    .from('login_events')
    .select('id')
    .eq('email', email)
    .eq('device_hash', deviceHash)
    .limit(1)
    .maybeSingle();

  const isNewDevice = !existing;

  await supabase.from('login_events').insert({
    email,
    device_hash: deviceHash,
    user_agent: userAgent,
    ip,
    is_new_device: isNewDevice,
  });

  if (!isNewDevice) {
    return new Response('known device', { status: 200, headers: corsHeaders });
  }

  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('email', email)
    .maybeSingle();
  const displayName = client?.name ?? 'Olivier';
  const date = new Date().toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'OTVT <contact@otvt.fr>',
      to: email,
      subject: 'Nouvelle connexion détectée sur votre espace otvt.fr',
      html: `<p>Bonjour ${displayName},</p><p>Une connexion à votre espace otvt.fr vient d'avoir lieu depuis un appareil ou navigateur qu'on ne reconnaît pas.</p><p>Date : ${date}<br>Adresse IP : ${ip}</p><p>Si c'est bien vous, vous pouvez ignorer cet email — cette notification n'apparaîtra plus pour cet appareil.</p><p>Si ce n'est pas vous : cliquez sur "Se déconnecter" depuis votre espace (cela invalide automatiquement toutes vos sessions actives, sur tous les appareils), puis contactez-nous à contact@otvt.fr.</p>`,
    }),
  });

  if (!emailResponse.ok) {
    const errorText = await emailResponse.text();
    return new Response(`resend error: ${errorText}`, {
      status: 502,
      headers: corsHeaders,
    });
  }

  return new Response('new device notified', {
    status: 200,
    headers: corsHeaders,
  });
});
