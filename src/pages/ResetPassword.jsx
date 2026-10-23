import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, LockKeyhole, Mail } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import {
  authRedirect,
  destinationAfterAuth,
  friendlyAuthError,
  rememberedRecoveryEmail,
  rememberRecoveryEmail,
} from '@/lib/customerAuth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const RECOVERY_MARKER = 'hc_password_recovery_authorized';

const recoveryErrorMessage = (description = '') => {
  const detail = String(description).replaceAll('+', ' ');
  if (/expired|otp_expired|invalid|already used/i.test(detail)) {
    return 'This password link has expired or was already used. Request a fresh link below.';
  }
  return 'This password link could not be verified. Request a fresh link below.';
};

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [email, setEmail] = useState(() => rememberedRecoveryEmail());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [sessionState, setSessionState] = useState('checking');

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const code = query.get('code');
    const linkError = query.get('error_description') || hash.get('error_description') || query.get('error_code') || hash.get('error_code');
    const recoveryHint = query.get('type') === 'recovery'
      || hash.get('type') === 'recovery'
      || Boolean(code)
      || Boolean(hash.get('access_token'))
      || query.get('onboarding') === 'yho';

    const markReady = (userId) => {
      if (!active || !userId) return;
      window.sessionStorage.setItem(RECOVERY_MARKER, JSON.stringify({ userId, at: Date.now() }));
      setError('');
      setSessionState('ready');
    };

    const listener = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && recoveryHint && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN')) {
        markReady(session.user.id);
      }
    });

    const establishRecoverySession = async () => {
      if (linkError) {
        if (active) {
          setError(recoveryErrorMessage(linkError));
          setSessionState('invalid');
        }
        return;
      }

      let exchangeError = null;
      if (code) {
        const result = await supabase.auth.exchangeCodeForSession(code);
        exchangeError = result.error;
      } else if (hash.get('access_token') && hash.get('refresh_token')) {
        const result = await supabase.auth.setSession({
          access_token: hash.get('access_token'),
          refresh_token: hash.get('refresh_token'),
        });
        exchangeError = result.error;
      }

      if (exchangeError) {
        if (active) {
          setError(recoveryErrorMessage(exchangeError.message));
          setSessionState('invalid');
        }
        return;
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      const marker = (() => {
        try { return JSON.parse(window.sessionStorage.getItem(RECOVERY_MARKER) || 'null'); } catch { return null; }
      })();
      const recentMarker = marker?.at > Date.now() - (15 * 60 * 1000) && marker?.userId === data.session?.user?.id;
      if (data.session?.user && (recoveryHint || recentMarker)) {
        markReady(data.session.user.id);
        if (window.location.hash || code) window.history.replaceState({}, '', '/ResetPassword');
      } else {
        setError(recoveryErrorMessage(sessionError?.message));
        setSessionState('invalid');
      }
    };

    void establishRecoverySession();
    return () => {
      active = false;
      listener.data.subscription.unsubscribe();
    };
  }, []);

  const requestAnotherLink = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter the email address used for your HC Apparel account.');
      return;
    }
    setRecoveryLoading(true);
    setError('');
    setNotice('');
    rememberRecoveryEmail(normalizedEmail);
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: authRedirect('/ResetPassword'),
    });
    setRecoveryLoading(false);
    if (recoveryError) {
      setError(friendlyAuthError(recoveryError, 'reset'));
      return;
    }
    setNotice('A fresh password link was requested. Check your inbox and open the newest message in Safari.');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (sessionState !== 'ready') {
      setError('Open a current password link from your email, or request a fresh link below.');
      return;
    }
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Use at least 12 characters with uppercase, lowercase, a number, and a symbol.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);
    const { data: updateData, error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setLoading(false);
      setError(friendlyAuthError(updateError, 'reset'));
      return;
    }

    window.sessionStorage.removeItem(RECOVERY_MARKER);
    window.localStorage.removeItem('hc_recovery_email');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', updateData.user.id).maybeSingle();
    const fallback = ['admin', 'operations_manager'].includes(profile?.role) ? '/AdminBusinessIntelligence' : '/Profile';
    navigate(destinationAfterAuth(null, fallback), { replace: true });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>Use the newest HC Apparel password email. Your password stays private and is never emailed to HC Apparel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {sessionState === 'checking' && (
            <Alert><Loader2 className="h-4 w-4 animate-spin" /><AlertDescription>Checking your secure password link…</AlertDescription></Alert>
          )}
          {sessionState === 'ready' && (
            <Alert><CheckCircle2 className="h-4 w-4" /><AlertDescription>Secure link verified. Choose your new password.</AlertDescription></Alert>
          )}
          {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}

          {sessionState === 'ready' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
              </div>
              <p className="text-xs text-muted-foreground">Use 12 or more characters with uppercase, lowercase, a number, and a symbol.</p>
              <Button type="submit" className="w-full min-h-12" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LockKeyhole className="w-4 h-4 mr-2" />}
                Save password and continue
              </Button>
            </form>
          ) : (
            <form onSubmit={requestAnotherLink} className="space-y-4 rounded-xl border bg-muted/30 p-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-email">HC Apparel account email</Label>
                <Input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
              <Button type="submit" variant="outline" className="w-full min-h-12" disabled={recoveryLoading}>
                {recoveryLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                Request another password link
              </Button>
            </form>
          )}
          <p className="text-center text-sm"><Link className="underline" to="/Login">Return to sign in</Link></p>
        </CardContent>
      </Card>
    </div>
  );
}
