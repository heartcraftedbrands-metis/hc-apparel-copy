import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, LockKeyhole, LogOut, Package, Settings, ShoppingBag, ShoppingCart, Trash2, Truck, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import DeleteAccountModal from '@/components/mobile/DeleteAccountModal';

function Action({ to, onClick, icon: Icon, title, detail }) {
  const content = <><Icon className="h-5 w-5 shrink-0 text-primary" /><span><span className="block font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{detail}</span></span></>;
  const className = 'flex w-full items-center gap-3 rounded-xl border bg-white p-4 text-left transition-colors hover:bg-muted/40';
  return to ? <Link to={to} className={className}>{content}</Link> : <button type="button" onClick={onClick} className={className}>{content}</button>;
}

export default function Profile() {
  const { user, isLoadingAuth, checkAppState } = useAuth();
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!user || isAdmin) return;
    let active = true;
    base44.entities.Order.list('-created_date', 50)
      .then((records) => { if (active) setOrders(records.filter((order) => !order.is_sample)); })
      .catch(() => { if (active) setOrdersError(true); })
      .finally(() => { if (active) setOrdersLoading(false); });
    return () => { active = false; };
  }, [user?.id, isAdmin]);

  if (isLoadingAuth) return <div className="container mx-auto max-w-5xl px-4 py-16 text-muted-foreground">Loading your account…</div>;
  if (!user) return <div className="flex flex-col items-center justify-center gap-4 px-4 py-24"><User className="h-14 w-14 text-muted-foreground" /><p>Sign in to see your HC Apparel account.</p><Button onClick={() => base44.auth.redirectToLogin()}>Sign in</Button></div>;

  const saveName = async (event) => {
    event.preventDefault();
    setMessage('');
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 100) { setMessage('Enter a name up to 100 characters.'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: cleanName } });
    setSaving(false);
    if (error) { setMessage('Could not update your name. Please try again.'); return; }
    await checkAppState();
    setEditingName(false);
    setMessage('Your name was updated.');
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setMessage('');
    if (newPassword.length < 8) { setMessage('Please use a stronger password with at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setMessage('The passwords do not match.'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) { setMessage('Could not change your password. Please try again or use password reset.'); return; }
    setNewPassword('');
    setConfirmPassword('');
    setChangingPassword(false);
    setMessage('Your password was updated.');
  };

  return <div className="min-h-[70vh] bg-[#f8f6ef] py-8 md:py-12"><div className="container mx-auto max-w-5xl space-y-7 px-4">
    <header className="rounded-2xl bg-primary p-6 text-primary-foreground md:p-8"><div className="flex items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15"><User className="h-7 w-7" /></div><div className="min-w-0"><p className="text-xs uppercase tracking-[0.2em] text-primary-foreground/70">HC Apparel account</p><h1 className="text-2xl font-bold md:text-3xl">{user.full_name || 'My Account'}</h1><p className="break-all text-sm text-primary-foreground/80">{user.email}</p></div></div><span className="mt-4 inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-medium">{isAdmin ? 'Admin' : 'Customer'}</span></header>
    {message && <p role="status" className="rounded-lg border bg-white p-3 text-sm">{message}</p>}
    {isAdmin ? <section className="space-y-3"><h2 className="text-xl font-bold">Admin tools</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Action to="/AdminDashboard" icon={Settings} title="Admin Dashboard" detail="Manage HC Apparel operations" /><Action to="/AdminProducts" icon={Package} title="Manage Products" detail="Review the catalog" /><Action to="/AdminOrders" icon={ShoppingBag} title="View Orders" detail="Admin order management" /><Action to="/AdminAnalytics" icon={BarChart3} title="Sales Analytics" detail="Review business activity" /></div></section> : <>
      <section className="space-y-3" id="my-orders"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">My Orders</h2><a href="#order-history" className="text-sm font-medium underline">View Order History</a></div><div className="rounded-xl border bg-white p-5" id="order-history">{ordersLoading ? <p className="text-sm text-muted-foreground">Loading your orders…</p> : ordersError ? <p className="text-sm">We could not load your orders right now. Please try again later.</p> : orders.length === 0 ? <div className="space-y-4"><p>No orders yet. Start shopping blanks or request a bulk quote.</p><div className="flex flex-wrap gap-2"><Button asChild><Link to="/ShopGarments">Shop Blanks</Link></Button><Button variant="outline" asChild><Link to="/RequestQuote">Request Bulk Quote 50+</Link></Button></div></div> : <ul className="divide-y">{orders.map((order) => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div><p className="font-medium">Order from {new Date(order.created_date).toLocaleDateString()}</p><p className="text-xs text-muted-foreground capitalize">{(order.fulfillment_status || order.status || 'received').replaceAll('_', ' ')}</p></div><Link className="text-sm font-medium text-primary underline" to="/TrackOrder">Track Order</Link></li>)}</ul>}</div><div className="grid gap-3 sm:grid-cols-2"><Action to="/TrackOrder" icon={Truck} title="Track Order" detail="Look up an order by its details" /><a href="#order-history" className="flex items-center gap-3 rounded-xl border bg-white p-4 hover:bg-muted/40"><Package className="h-5 w-5 text-primary" /><span><span className="block font-semibold">View Order History</span><span className="text-xs text-muted-foreground">Review orders on this account</span></span></a></div></section>
      <section className="space-y-3"><h2 className="text-xl font-bold">Shopping tools</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Action to="/ShopGarments" icon={ShoppingBag} title="Continue Shopping" detail="Explore apparel blanks" /><Action onClick={() => window.dispatchEvent(new Event('hc:open-cart'))} icon={ShoppingCart} title="Cart" detail="Review your saved items" /><Action to="/RequestQuote" icon={Package} title="Bulk Quote 50+" detail="Request a larger order" /></div></section>
    </>}
    <section className="space-y-3"><h2 className="text-xl font-bold">Account tools</h2><div className="grid gap-3 sm:grid-cols-2"><Action onClick={() => { setName(user.full_name || ''); setEditingName(!editingName); setChangingPassword(false); setMessage(''); }} icon={User} title="Update profile / name" detail="Edit the name on your account" /><Action onClick={() => { setChangingPassword(!changingPassword); setEditingName(false); setMessage(''); }} icon={LockKeyhole} title="Change password" detail="Choose a new password while signed in" /></div>{editingName && <form onSubmit={saveName} className="space-y-3 rounded-xl border bg-white p-5"><Label htmlFor="account-name">Name</Label><Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /><Button disabled={saving}>Save name</Button></form>}{changingPassword && <form onSubmit={savePassword} className="space-y-3 rounded-xl border bg-white p-5"><Label htmlFor="account-password">New password</Label><Input id="account-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><Label htmlFor="account-confirm">Confirm password</Label><Input id="account-confirm" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><Button disabled={saving}>Save new password</Button></form>}<Button variant="outline" onClick={() => base44.auth.logout()}><LogOut className="mr-2 h-4 w-4" />Logout</Button></section>
    <section className="border-t pt-5"><h2 className="text-sm font-semibold text-muted-foreground">Danger zone</h2><button type="button" onClick={() => setShowDelete(true)} className="mt-2 inline-flex items-center gap-2 text-sm text-red-700 underline"><Trash2 className="h-4 w-4" />Delete Account</button></section><DeleteAccountModal open={showDelete} onClose={() => setShowDelete(false)} />
  </div></div>;
}
