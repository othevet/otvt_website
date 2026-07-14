import { supabase } from './supabase';

type LoginTranslations = {
  sending: string;
  linkError: string;
  codeSent: string;
  sendLink: string;
  verifying: string;
  codeInvalid: string;
  verifyCode: string;
  codeResendCooldown: string;
};

// Défense en profondeur côté client : Supabase applique déjà un cooldown
// serveur (~60s par adresse) sur signInWithOtp, mais un retour visible
// immédiat évite le spam-clic et les allers-retours inutiles.
const CODE_RESEND_COOLDOWN_MS = 30_000;
let lastCodeSentAt = 0;

export function getRedirectPath(defaultPath: string) {
  const redirectParam = new URLSearchParams(window.location.search).get(
    'redirect',
  );
  return redirectParam && redirectParam.startsWith('/')
    ? redirectParam
    : defaultPath;
}

export async function redirectIfLoggedIn(defaultPath: string) {
  const accountPath = getRedirectPath(defaultPath);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) window.location.href = accountPath;
}

export function initLoginFlow(defaultPath: string, t: LoginTranslations) {
  const emailForm = document.getElementById(
    'login-form',
  ) as HTMLFormElement | null;
  const codeForm = document.getElementById(
    'code-form',
  ) as HTMLFormElement | null;
  const status = document.getElementById('login-status');
  const emailInput = document.getElementById(
    'email',
  ) as HTMLInputElement | null;
  const codeInput = document.getElementById(
    'code',
  ) as HTMLInputElement | null;
  const changeEmailButton = document.getElementById('change-email');
  if (
    !emailForm ||
    !codeForm ||
    !status ||
    !emailInput ||
    !codeInput ||
    !changeEmailButton
  )
    return;
  if (emailForm.dataset.initialized) return;
  emailForm.dataset.initialized = 'true';

  const emailSubmit = emailForm.querySelector('button[type="submit"]');
  const emailLabel = emailSubmit?.querySelector('.submit-label');
  const codeSubmit = codeForm.querySelector('button[type="submit"]');
  const codeLabel = codeSubmit?.querySelector('.verify-label');

  emailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    if (!email || !emailSubmit || !emailLabel) return;

    const remainingCooldown =
      CODE_RESEND_COOLDOWN_MS - (Date.now() - lastCodeSentAt);
    if (remainingCooldown > 0) {
      status.textContent = t.codeResendCooldown.replace(
        '{{seconds}}',
        String(Math.ceil(remainingCooldown / 1000)),
      );
      status.className = 'mt-5 text-sm text-danger';
      status.classList.remove('hidden');
      return;
    }

    emailSubmit.setAttribute('disabled', 'true');
    emailLabel.textContent = t.sending;
    status.classList.add('hidden');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) {
      status.textContent = t.linkError;
      status.className = 'mt-5 text-sm text-danger';
      status.classList.remove('hidden');
    } else {
      lastCodeSentAt = Date.now();
      status.textContent = t.codeSent;
      status.className = 'mt-5 text-sm text-vert';
      status.classList.remove('hidden');
      emailForm.classList.add('hidden');
      codeForm.classList.remove('hidden');
      codeInput.focus();
    }

    emailSubmit.removeAttribute('disabled');
    emailLabel.textContent = t.sendLink;
  });

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const code = codeInput.value.trim();
    if (!code || !codeSubmit || !codeLabel) return;

    codeSubmit.setAttribute('disabled', 'true');
    codeLabel.textContent = t.verifying;

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    if (error) {
      status.textContent = t.codeInvalid;
      status.className = 'mt-5 text-sm text-danger';
      status.classList.remove('hidden');
      codeSubmit.removeAttribute('disabled');
      codeLabel.textContent = t.verifyCode;
    } else {
      // DEBUG TEMPORAIRE : affiche le résultat de l'appel avant de
      // rediriger, pour diagnostiquer pourquoi login_events reste vide.
      // À retirer une fois le problème identifié.
      const debugResult = await supabase.functions
        .invoke('log-login-device')
        .catch((err) => ({ data: null, error: String(err) }));
      alert('log-login-device: ' + JSON.stringify(debugResult));
      window.location.href = getRedirectPath(defaultPath);
    }
  });

  changeEmailButton.addEventListener('click', () => {
    codeForm.classList.add('hidden');
    emailForm.classList.remove('hidden');
    status.classList.add('hidden');
    codeForm.reset();
  });
}
