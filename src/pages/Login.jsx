import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, LogIn, Mail } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);

  if (!isLoadingAuth && isAuthenticated) return <Navigate to="/Profile" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    const returnTo = sessionStorage.getItem('hc_login_return_to');
    sessionStorage.removeItem('hc_login_return_to');
    if (returnTo) {
      try {
        const url = new URL(returnTo, window.location.origin);
        if (url.origin === window.location.origin) {
          navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
          return;
        }
      } catch {
        // Ignore invalid legacy return URLs.
      }
    }
    navigate('/Profile', { replace: true });
  };

  const handlePasswordRecovery = async () => {
    if (!email) {
      setError('Enter your email address first.');
      return;
    }

    setRecoveryLoading(true);
    setError('');
    setRecoverySent(false);
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/ResetPassword`,
    });
    setRecoveryLoading(false);

    if (recoveryError) {
      setError(recoveryError.message);
      return;
    }

    setRecoverySent(true);
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your HC Apparel account and order information.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {searchParams.get('passwordReset') === '1' && (
              <Alert><AlertDescription>Password updated. Sign in with your new password.</AlertDescription></Alert>
            )}
            {recoverySent && (
              <Alert><AlertDescription>Check your email for the password-reset link.</AlertDescription></Alert>
            )}
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LogIn className="w-4 h-4 mr-2" />}
              Sign in
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={recoveryLoading}
              onClick={handlePasswordRecovery}
            >
              {recoveryLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Reset password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
