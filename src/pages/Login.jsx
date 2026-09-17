import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, LogIn, Mail } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { authRedirect, destinationAfterAuth, friendlyAuthError } from '@/lib/customerAuth';
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
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (signInError) {
      setError(friendlyAuthError(signInError));
      return;
    }
    navigate(destinationAfterAuth(), { replace: true });
  };

  const handlePasswordRecovery = async () => {
    if (!email) {
      setError('Enter your email address first.');
      return;
    }

    setRecoveryLoading(true);
    setError('');
    setRecoverySent(false);
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: authRedirect('/ResetPassword'),
    });
    setRecoveryLoading(false);

    if (recoveryError) {
      setError(friendlyAuthError(recoveryError, 'reset'));
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
            {searchParams.get('confirmed') === '1' && (
              <Alert><AlertDescription>Your HC Apparel email is confirmed. Please sign in.</AlertDescription></Alert>
            )}
            {recoverySent && (
              <Alert><AlertDescription>Password reset email sent. Please check your inbox.</AlertDescription></Alert>
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
            <p className="text-sm text-center">New to HC Apparel? <Link className="underline" to="/Signup">Create an account</Link></p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
