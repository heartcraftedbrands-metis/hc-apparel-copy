export const AUTH_SITE_URL = 'https://www.ilovehcapparel.net';

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

export function destinationAfterAuth() {
  const returnTo = sessionStorage.getItem('hc_login_return_to');
  sessionStorage.removeItem('hc_login_return_to');
  if (returnTo) {
    try {
      const url = new URL(returnTo, window.location.origin);
      // ProtectedRoute still checks the server-backed role for admin destinations.
      if (url.origin === window.location.origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      // Discard malformed or external return targets.
    }
  }
  return '/Profile';
}
