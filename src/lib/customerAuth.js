export const AUTH_SITE_URL = 'https://www.ilovehcapparel.net';

const AUTH_RETURN_KEY = 'hc_login_return_to';
const RECOVERY_EMAIL_KEY = 'hc_recovery_email';
const INTERNAL_DESTINATIONS = [
  '/AdminBusinessIntelligence',
  '/AdminDTFTransfers',
  '/AdminOperationsInbox',
  '/AdminOrderDetail',
  '/Operations',
  '/Profile',
];

export function safeInternalDestination(value, fallback = '/Profile') {
  if (!value) return fallback;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : AUTH_SITE_URL;
    const url = new URL(String(value), base);
    const allowedOrigin = new URL(AUTH_SITE_URL).origin;
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : allowedOrigin;
    if (![allowedOrigin, currentOrigin].includes(url.origin)) return fallback;
    if (!INTERNAL_DESTINATIONS.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function rememberAuthDestination(value) {
  const destination = safeInternalDestination(value);
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(AUTH_RETURN_KEY, destination);
    window.localStorage.setItem(AUTH_RETURN_KEY, destination);
  }
  return destination;
}

export function rememberRecoveryEmail(value) {
  if (typeof window === 'undefined') return;
  const email = String(value || '').trim().toLowerCase();
  if (email) window.localStorage.setItem(RECOVERY_EMAIL_KEY, email);
}

export function rememberedRecoveryEmail() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(RECOVERY_EMAIL_KEY) || '';
}

export function authRedirect(path) {
  return `${AUTH_SITE_URL}${path}`;
}

export function friendlyAuthError(error, action = 'login') {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('already registered') || message.includes('already exists') || message.includes('user already')) {
    return 'An account with this email already exists. Please sign in or reset your password.';
  }
  if (message.includes('weak password') || message.includes('password should') || message.includes('password must')) {
    return 'Please use a stronger password with at least 8 characters.';
  }
  if (message.includes('email not confirmed')) return 'Check your email to confirm your HC Apparel account.';
  if (action === 'login') return 'We could not sign you in. Check your email and password or reset your password.';
  if (action === 'reset') return 'We could not reset your password. Request a new reset link and try again.';
  return 'We could not create your account right now. Please try again or contact HC Apparel.';
}

export function destinationAfterAuth(explicitDestination, fallback = '/Profile') {
  if (typeof window === 'undefined') return safeInternalDestination(explicitDestination, fallback);
  const returnTo = explicitDestination
    || window.sessionStorage.getItem(AUTH_RETURN_KEY)
    || window.localStorage.getItem(AUTH_RETURN_KEY);
  window.sessionStorage.removeItem(AUTH_RETURN_KEY);
  window.localStorage.removeItem(AUTH_RETURN_KEY);
  return safeInternalDestination(returnTo, fallback);
}
