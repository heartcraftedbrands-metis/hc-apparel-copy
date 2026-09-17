import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { authRedirect, destinationAfterAuth, friendlyAuthError } from '@/lib/customerAuth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Signup() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoadingAuth && isAuthenticated) return <Navigate to="/Profile" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (password.length < 8) {
      setError('Please use a stronger password with at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);
    const { data, error: signupError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: authRedirect('/Login?confirmed=1'),
        data: { full_name: name.trim() },
      },
    });
    setLoading(false);
    if (signupError) {
      setError(friendlyAuthError(signupError, 'signup'));
      return;
    }
    // Supabase may deliberately obscure duplicate addresses while confirmations are enabled.
    if (data?.user?.identities?.length === 0) {
      setError('An account with this email already exists. Please sign in or reset your password.');
      return;
    }
    if (!data?.session) {
      setNotice('Account confirmation email sent. Please check your inbox. Check your email to confirm your HC Apparel account.');
      return;
    }
    navigate(destinationAfterAuth(), { replace: true });
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your HC Apparel account</CardTitle>
          <CardDescription>Save your details and shop apparel blanks and printing options.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {notice && <Alert><AlertDescription>{notice}</AlertDescription></Alert>}
            <div className="space-y-2"><Label htmlFor="signup-name">Name (optional)</Label><Input id="signup-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="signup-email">Email</Label><Input id="signup-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="signup-password">Password (at least 8 characters)</Label><Input id="signup-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <div className="space-y-2"><Label htmlFor="signup-confirm">Confirm password</Label><Input id="signup-confirm" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={loading || Boolean(notice)}>{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create account</Button>
            <p className="text-sm text-center">Already have an account? <Link className="underline" to="/Login">Sign in</Link></p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
