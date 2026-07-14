// Appelée par le client (login-flow.ts) juste après une connexion réussie
// (verifyOtp). Enregistre l'événement dans login_events et envoie un email
// via Resend si le couple (email, user-agent + IP) n'a jamais été vu — un
// signal "nouvel appareil", best-effort, pas une preuve cryptographique.
//
// verify_jwt = true (voir config.toml) : contrairement à
// notify-client-message, l'appelant a déjà une session valide à ce stade
// (on vient de terminer signInWithOtp/verifyOtp) — Supabase vérifie le JWT
// avant même d'invoquer cette fonction. L'email vient du JWT vérifié via
// getUser(), jamais d'un paramètre fourni par l'appelant : impossible de
// déclencher un faux événement/email pour quelqu'un d'autre.
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
  // Le runtime Supabase a déjà refusé la requête si le JWT est absent ou
  // invalide (verify_jwt=true) ; on le revalide ici pour récupérer l'email
  // de façon fiable, jamais fourni par le corps de la requête.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();

  if (!user?.email) {
    return new Response('unauthorized', { status: 401 });
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
    return new Response('known device', { status: 200 });
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
    return new Response(`resend error: ${errorText}`, { status: 502 });
  }

  return new Response('new device notified', { status: 200 });
});
