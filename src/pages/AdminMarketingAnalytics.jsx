import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { marketingAdmin } from '@/lib/marketingAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const eventNames = ['view_product','add_to_cart','begin_checkout','purchase','newsletter_signup','bulk_quote_submit','contact_submit','social_post_created','social_post_sent_to_buffer'];
const titles = { view_product: 'Product views', add_to_cart: 'Adds to cart', begin_checkout: 'Checkout starts', purchase: 'Purchases', newsletter_signup: 'Newsletter signups', bulk_quote_submit: 'Bulk quote submissions', contact_submit: 'Contact submissions', social_post_created: 'Social drafts created', social_post_sent_to_buffer: 'Sent to Buffer' };
const top = (events, name) => Object.values(events.filter(row => row.event_name === name && row.product_id).reduce((items, row) => { const key = row.product_id; items[key] ??= { name: row.product_name || key, count: 0 }; items[key].count += 1; return items; }, {})).sort((a, b) => b.count - a.count).slice(0, 5);

export default function AdminMarketingAnalytics() {
  const [events, setEvents] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { Promise.all([
    supabase.from('marketing_events').select('event_name,product_id,product_name,is_test,created_at').eq('is_test', false).order('created_at', { ascending: false }).limit(10000),
    supabase.from('orders').select('id,order_items,total_amount,payment_status,status,is_sample,created_date').eq('is_sample', false).eq('payment_status', 'paid').not('status', 'in', '(canceled,refunded)').limit(5000),
    marketingAdmin('settings'),
  ]).then(([eventResult, orderResult, config]) => { if (eventResult.error || orderResult.error) throw new Error('Could not load marketing analytics. Apply the migration.'); setEvents(eventResult.data || []); setOrders(orderResult.data || []); setSettings(config); }).catch(issue => setError(issue.message)); }, []);
  const counts = useMemo(() => Object.fromEntries(eventNames.map(name => [name, events.filter(row => row.event_name === name).length])), [events]);
  const purchasedProducts = useMemo(() => { const items = new Map(); for (const order of orders) for (const item of Array.isArray(order.order_items) ? order.order_items : []) { const name = item.product_name || item.name || item.product_id || 'Unknown product'; const entry = items.get(name) || { name, count: 0 }; entry.count += Number(item.quantity) || 1; items.set(name, entry); } return [...items.values()].sort((a, b) => b.count - a.count).slice(0, 5); }, [orders]);
  const revenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const save = async () => { setBusy(true); setError(''); try { await marketingAdmin('update_settings', settings); setNotice('Tracking settings saved. Only public IDs are used in the storefront.'); } catch (issue) { setError(issue.message); } finally { setBusy(false); } };
  return <main className="min-h-screen bg-[#f6f3ea] p-4 md:p-8"><div className="mx-auto max-w-7xl space-y-6"><Link to="/AdminDashboard" className="text-sm text-primary underline">Admin Dashboard</Link><div><h1 className="text-3xl font-bold text-primary">Marketing Analytics</h1><p className="text-sm text-muted-foreground">Internal events and paid live orders. QA/sample and refunded/canceled orders are excluded. No customer emails or addresses go to pixels.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}{notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{eventNames.map(name => <div key={name} className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">{titles[name]}</p><p className="text-2xl font-bold">{name === 'purchase' ? orders.length : counts[name]}</p></div>)}<div className="rounded-xl border bg-white p-4"><p className="text-xs text-muted-foreground">Revenue · live paid orders</p><p className="text-2xl font-bold">${revenue.toFixed(2)}</p></div></div>
    <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Conversion funnel</h2><p className="mt-2 text-sm">{counts.view_product} product views → {counts.add_to_cart} adds to cart → {counts.begin_checkout} checkout starts → {orders.length} paid purchases</p><p className="mt-2 text-xs text-muted-foreground">Counts are event totals, not unique visitors. Purchase and revenue use live paid orders.</p></section>
    <div className="grid gap-4 md:grid-cols-3">{[['Top products viewed', top(events, 'view_product')], ['Top products added to cart', top(events, 'add_to_cart')], ['Top products purchased', purchasedProducts]].map(([title, rows]) => <section key={title} className="rounded-xl border bg-white p-5"><h2 className="font-bold">{title}</h2><ol className="mt-3 space-y-2 text-sm">{rows.length ? rows.map((row, index) => <li key={row.name}>{index + 1}. {row.name} <span className="text-muted-foreground">({row.count})</span></li>) : <li className="text-muted-foreground">No data yet.</li>}</ol></section>)}</div>
    {settings && <section className="rounded-xl border bg-white p-5"><h2 className="font-bold">Tracking settings</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm">GA4 Measurement ID<Input value={settings.ga4_measurement_id || ''} onChange={event => setSettings(current => ({ ...current, ga4_measurement_id: event.target.value }))} placeholder="G-XXXXXXXXXX" className="mt-1" /></label><label className="text-sm">Pinterest Tag ID<Input value={settings.pinterest_tag_id || ''} onChange={event => setSettings(current => ({ ...current, pinterest_tag_id: event.target.value }))} className="mt-1" /></label></div><div className="mt-4 space-y-2 text-sm"><label className="flex gap-2"><input type="checkbox" checked={settings.internal_analytics_enabled} onChange={event => setSettings(current => ({ ...current, internal_analytics_enabled: event.target.checked }))} />Internal analytics enabled</label><label className="flex gap-2"><input type="checkbox" checked={settings.vercel_analytics_enabled} onChange={event => setSettings(current => ({ ...current, vercel_analytics_enabled: event.target.checked }))} />Vercel Analytics enabled (integration later; no script loaded yet)</label></div><Button onClick={save} disabled={busy} className="mt-4">{busy ? 'Saving…' : 'Save tracking settings'}</Button></section>}
  </div></main>;
}
