import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, CalendarClock, Check, ExternalLink, FileImage, Loader2, PauseCircle, RefreshCw, Search, ShieldCheck, Upload, X } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const emptyCampaign = {
  campaign: '', campaign_key: '', goal: '', campaign_notes: '', platforms: ['facebook', 'pinterest'],
  start_date: '', end_date: '', publishing_frequency_per_week: 2, automatic_publishing_enabled: false,
  facebook_channel_id: '', pinterest_channel_id: '', pinterest_board_id: '', pinterest_board_name: '', status: 'Planning',
};
const emptyResearch = {
  source_type: 'Official Platform', source_title: '', source_url: '', observed_at: new Date().toISOString().slice(0, 10),
  evidence_summary: '', asset_fit: '', recommendation_type: 'Observed evidence', keywords: '', aggregate_audience: '',
};

async function agent(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('marketing-agent', { body: { action, ...payload } });
  if (!error && !data?.error) return data;
  let message = data?.error || error?.message || 'Marketing Agent request failed.';
  try { message = (await error?.context?.json?.())?.error || message; } catch { /* Keep the safe transport message. */ }
  throw new Error(message);
}

function Field({ label, value, onChange, type = 'text', placeholder = '', min = undefined, max = undefined }) {
  return <label className="min-w-0 text-xs font-bold text-muted-foreground">{label}<Input className="mt-1 min-h-11 bg-white text-base sm:text-sm" type={type} value={value ?? ''} placeholder={placeholder} min={min} max={max} onChange={event => onChange(event.target.value)} /></label>;
}
function TextArea({ label, value, onChange, rows = 4, placeholder = '' }) {
  return <label className="min-w-0 text-xs font-bold text-muted-foreground">{label}<textarea className="mt-1 w-full resize-y rounded-md border bg-white px-3 py-2 text-base font-normal text-foreground sm:text-sm" value={value ?? ''} rows={rows} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></label>;
}
function SelectField({ label, value, onChange, children }) {
  return <label className="min-w-0 text-xs font-bold text-muted-foreground">{label}<select className="mt-1 min-h-11 w-full rounded-md border bg-white px-3 text-base font-normal text-foreground sm:text-sm" value={value ?? ''} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}
function Section({ title, description, children, action = null }) {
  return <Card className="overflow-hidden"><header className="flex flex-wrap items-start justify-between gap-3 border-b p-4"><div><h2 className="font-black text-primary">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}</div>{action}</header><div className="p-4">{children}</div></Card>;
}
function StatePill({ state }) {
  const tone = state === 'Published' ? 'bg-green-100 text-green-800' : state === 'Failed' ? 'bg-red-100 text-red-800' : state === 'Cancelled' ? 'bg-muted text-muted-foreground' : state === 'Approved' ? 'bg-blue-100 text-blue-800' : state === 'Scheduled' || state === 'Publishing' ? 'bg-amber-100 text-amber-900' : 'bg-primary/10 text-primary';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${tone}`}>{state || 'Draft'}</span>;
}
const serviceName = channel => String(channel?.service || '').toLowerCase();
const localDateTime = value => value ? new Date(value).toISOString().slice(0, 16) : '';
const money = value => Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : '—';

function PostReview({ post, channels, onRun }) {
  const [draft, setDraft] = useState({
    post_title: post.post_title || '', post_description: post.post_description || post.caption || '', alt_text: post.alt_text || '',
    cta: post.cta || '', keywords: (post.keywords || []).join(', '), scheduled_at: localDateTime(post.scheduled_at),
    channel_id: post.buffer_channel_id || '', pinterest_board_id: post.pinterest_board_id || '',
  });
  useEffect(() => setDraft({
    post_title: post.post_title || '', post_description: post.post_description || post.caption || '', alt_text: post.alt_text || '',
    cta: post.cta || '', keywords: (post.keywords || []).join(', '), scheduled_at: localDateTime(post.scheduled_at),
    channel_id: post.buffer_channel_id || '', pinterest_board_id: post.pinterest_board_id || '',
  }), [post]);
  const availableChannels = channels.filter(channel => serviceName(channel) === post.platform && !channel.isDisconnected && !channel.isLocked);
  const selectedChannel = availableChannels.find(channel => channel.id === draft.channel_id);
  const patch = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const save = () => onRun('update_post', { post_id: post.id, ...draft, keywords: draft.keywords.split(',').map(value => value.trim()).filter(Boolean), scheduled_at: draft.scheduled_at ? new Date(draft.scheduled_at).toISOString() : null }, 'Draft changes saved.');
  const schedule = () => onRun('schedule_post', { post_id: post.id, channel_id: draft.channel_id, pinterest_board_id: draft.pinterest_board_id, scheduled_at: draft.scheduled_at ? new Date(draft.scheduled_at).toISOString() : null, confirmed: true }, 'Post scheduled and verified through the connected channel.');
  return <article className="min-w-0 rounded-xl border bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><StatePill state={post.workflow_status} /><span className="text-xs font-black uppercase tracking-wide text-muted-foreground">{post.platform}</span>{post.product_name && <span className="text-xs text-muted-foreground">{post.product_name}</span>}</div>{post.image_url && <img className="h-14 w-14 rounded-lg border bg-muted object-contain" src={post.image_url} alt="Publishing preview" />}</div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2"><Field label="Post title" value={draft.post_title} onChange={value => patch('post_title', value)} /><Field label="CTA" value={draft.cta} onChange={value => patch('cta', value)} /><TextArea label="Platform description" value={draft.post_description} onChange={value => patch('post_description', value)} rows={5} /><TextArea label="Image alt text" value={draft.alt_text} onChange={value => patch('alt_text', value)} rows={5} /><Field label="Keywords (comma separated)" value={draft.keywords} onChange={value => patch('keywords', value)} /><Field label="Publish time (Eastern Time)" type="datetime-local" value={draft.scheduled_at} onChange={value => patch('scheduled_at', value)} /></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <SelectField label={post.platform === 'facebook' ? 'Facebook Page' : 'Pinterest account'} value={draft.channel_id} onChange={value => patch('channel_id', value)}><option value="">Select connected channel</option>{availableChannels.map(channel => <option value={channel.id} key={channel.id}>{channel.name}</option>)}</SelectField>
      {post.platform === 'pinterest' && <SelectField label="Pinterest board" value={draft.pinterest_board_id} onChange={value => patch('pinterest_board_id', value)}><option value="">Select board</option>{(selectedChannel?.boards || []).map(board => <option value={board.serviceId} key={board.serviceId}>{board.name}</option>)}</SelectField>}
    </div>
    <dl className="mt-3 grid gap-2 rounded-lg bg-muted/45 p-3 text-xs sm:grid-cols-2"><div><dt className="font-bold">Tracked destination</dt><dd className="break-all text-muted-foreground">{post.tracking_url || post.destination_url}</dd></div><div><dt className="font-bold">Platform request ID</dt><dd className="break-all text-muted-foreground">{post.platform_post_id || 'Not sent'}</dd></div><div><dt className="font-bold">Live link</dt><dd>{post.platform_live_url ? <a className="text-primary underline" href={post.platform_live_url} target="_blank" rel="noreferrer">Open published post</a> : 'Not returned by the connected publishing API'}</dd></div><div><dt className="font-bold">Metrics</dt><dd>{post.metrics_retrieved_at ? JSON.stringify(post.metrics) : 'No official metrics retrieved'}</dd></div></dl>
    {post.failure_reason && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"><b>Failure:</b> {post.failure_reason}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {['Draft', 'Approved'].includes(post.workflow_status) && <Button size="sm" variant="outline" onClick={save}>Save edits</Button>}
      {post.workflow_status === 'Draft' && <Button size="sm" onClick={() => onRun('create_approval_request', { page_key: 'hc_apparel', request_type: 'post', source_kind: 'draft', proposed_content: draft.post_description, image_url: post.image_url, linked_post_id: post.id }, 'Approval request saved and the owner notification was processed. Nothing was published.')}><Check className="mr-1 h-4 w-4" />Request approval</Button>}
      {post.workflow_status === 'Approved' && <Button size="sm" disabled={!draft.channel_id || !draft.scheduled_at || (post.platform === 'pinterest' && !draft.pinterest_board_id)} onClick={schedule}><CalendarClock className="mr-1 h-4 w-4" />Schedule</Button>}
      {post.workflow_status === 'Failed' && <Button size="sm" onClick={() => onRun('retry_post', { post_id: post.id }, 'Post returned to Approved for a controlled retry.')}><RefreshCw className="mr-1 h-4 w-4" />Prepare retry</Button>}
      {['Scheduled', 'Publishing'].includes(post.workflow_status) && <Button size="sm" variant="outline" onClick={() => onRun('refresh_post', { post_id: post.id }, 'Platform status refreshed.')}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>}
      {!['Published', 'Cancelled'].includes(post.workflow_status) && <Button size="sm" variant="destructive" onClick={() => window.confirm('Cancel this draft or remove its queued platform post?') && onRun('cancel_post', { post_id: post.id }, 'Post cancelled.')}><X className="mr-1 h-4 w-4" />Cancel</Button>}
    </div>
  </article>;
}

export function MarketingAgentCalendarQueue({ onOpenAgent }) {
  const [data, setData] = useState(null);
  useEffect(() => { let active = true; agent('status').then(result => active && setData(result)).catch(() => active && setData({ posts: [] })); return () => { active = false; }; }, []);
  const rows = (data?.posts || []).filter(post => ['Approved', 'Scheduled', 'Publishing', 'Failed'].includes(post.workflow_status)).slice(0, 8);
  return <div className="mb-5 rounded-xl border bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-primary">Facebook + Pinterest agent</p><h2 className="mt-1 text-lg font-black">Approval and publishing queue</h2><p className="text-sm text-muted-foreground">Eastern Time. Only approved items can be handed to a connected channel.</p></div>{onOpenAgent && <Button size="sm" onClick={onOpenAgent}>Open Marketing Agent</Button>}</div>{rows.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{rows.map(row => <div key={row.id} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><b className="truncate text-sm capitalize">{row.platform}</b><StatePill state={row.workflow_status} /></div><p className="mt-2 line-clamp-2 text-xs">{row.post_title || row.product_name || 'Untitled draft'}</p><p className="mt-1 text-xs text-muted-foreground">{row.scheduled_at ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(row.scheduled_at)) : 'Time not set'}</p></div>)}</div> : <p className="mt-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No approved, scheduled, publishing, or failed agent items.</p>}</div>;
}

export default function MarketingAgent() {
  const [data, setData] = useState({ campaigns: [], posts: [], research: [], channels: [], page_scopes: [], approvals: [], notifications: [], settings: null, interaction_policy: {}, metrics_policy: '', buffer_configured: false, buffer_error: '' });
  const [campaign, setCampaign] = useState(emptyCampaign);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [asset, setAsset] = useState(null);
  const [assetPreview, setAssetPreview] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [brief, setBrief] = useState({ notes: '', cta: 'Shop HC Apparel', destination_url: '', platforms: ['facebook', 'pinterest'] });
  const [research, setResearch] = useState(emptyResearch);
  const [approvalDraft, setApprovalDraft] = useState({ page_key: 'hc_apparel', request_type: 'post', source_kind: 'photo', proposed_content: '', source_material: '', conversation_id: '', incoming_message_id: '' });

  const load = async () => {
    setBusy(current => current || 'load');
    try {
      const result = await agent('status');
      setData(result);
      setSelectedCampaignId(current => current || result.campaigns?.find(item => !['Completed', 'Archived', 'Cancelled'].includes(item.status))?.id || '');
    } catch (issue) { setError(issue.message); }
    finally { setBusy(current => current === 'load' ? '' : current); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => () => { if (assetPreview) URL.revokeObjectURL(assetPreview); }, [assetPreview]);
  const facebookChannels = useMemo(() => data.channels.filter(channel => serviceName(channel) === 'facebook' && !channel.isDisconnected && !channel.isLocked), [data.channels]);
  const pinterestChannels = useMemo(() => data.channels.filter(channel => serviceName(channel) === 'pinterest' && !channel.isDisconnected && !channel.isLocked), [data.channels]);
  const selectedPinterest = pinterestChannels.find(channel => channel.id === campaign.pinterest_channel_id);
  const currentCampaign = data.campaigns.find(item => item.id === selectedCampaignId);
  const campaignPosts = data.posts.filter(post => post.campaign_id === selectedCampaignId);
  const changeCampaign = (key, value) => setCampaign(current => ({ ...current, [key]: value }));
  const changeBriefPlatform = platform => setBrief(current => ({ ...current, platforms: current.platforms.includes(platform) ? current.platforms.filter(value => value !== platform) : [...current.platforms, platform] }));
  const run = async (action, payload, success) => {
    setBusy(action); setError(''); setNotice('');
    try { await agent(action, payload); setNotice(success); await load(); }
    catch (issue) { setError(issue.message); }
    finally { setBusy(''); }
  };
  const saveCampaign = async () => {
    const confirmed = !campaign.automatic_publishing_enabled || window.confirm(`Authorize automatic scheduling only for ${campaign.platforms.join(' + ')}, ${campaign.publishing_frequency_per_week} post(s) per week, from ${campaign.start_date || 'unset'} through ${campaign.end_date || 'unset'}, in Eastern Time?`);
    if (!confirmed) return;
    setBusy('campaign'); setError(''); setNotice('');
    try {
      const result = await agent('save_campaign', { ...campaign, confirmed });
      setSelectedCampaignId(result.campaign.id); setCampaign(emptyCampaign); setNotice('Campaign saved. Drafts still require approval.'); await load();
    } catch (issue) { setError(issue.message); } finally { setBusy(''); }
  };
  const editCampaign = item => {
    setCampaign({ ...emptyCampaign, ...item, platforms: item.platforms || [], start_date: item.start_date || '', end_date: item.end_date || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const upload = async file => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('Choose a PNG, JPG/JPEG, or WEBP image under 10 MB.'); return; }
    setBusy('upload'); setError('');
    try {
      const body = new FormData(); body.append('action', 'upload_asset'); body.append('file', file);
      const { data: result, error: uploadError } = await supabase.functions.invoke('marketing-agent', { body });
      if (uploadError || result?.error) throw new Error(result?.error || uploadError.message || 'Upload failed.');
      if (assetPreview) URL.revokeObjectURL(assetPreview);
      setAsset(result); setAssetPreview(URL.createObjectURL(file)); setNotice('Original saved privately. Publishing will use a separate derivative.');
    } catch (issue) { setError(issue.message); } finally { setBusy(''); }
  };
  const searchProducts = async () => {
    setBusy('search'); setError('');
    try { const result = await agent('search_products', { query: productQuery }); setProducts(result.products || []); }
    catch (issue) { setError(issue.message); } finally { setBusy(''); }
  };
  const generate = () => run('generate_drafts', { campaign_id: selectedCampaignId, product_id: selectedProduct?.id || null, source_asset_path: asset?.source_asset_path || null, ...brief }, 'Platform-specific drafts created for review. Nothing was published.');
  const saveResearch = async () => {
    await run('record_research', { ...research, campaign_id: selectedCampaignId || null, keywords: research.keywords.split(',').map(value => value.trim()).filter(Boolean) }, 'Research evidence saved with its date and source.');
    setResearch(emptyResearch);
  };
  const requestApproval = () => run('create_approval_request', { ...approvalDraft, image_path: asset?.source_asset_path || null }, 'Approval request saved. The owner email notification was processed; nothing was published or sent to Facebook.');
  const reviewApproval = (item, decision) => {
    const payload = { approval_id: item.id, decision, content_version: item.content_version, content_hash: item.content_hash };
    if (decision === 'edit') {
      const proposed_content = window.prompt('Edit the proposed content. Saving creates a new version that requires fresh approval.', item.proposed_content);
      if (proposed_content === null) return;
      payload.proposed_content = proposed_content;
    }
    if (decision === 'schedule') {
      const scheduled_at = window.prompt('Schedule time in ISO format, including time zone offset. This records the approved calendar time; publishing remains a separate connected-channel action.', new Date(Date.now() + 86400000).toISOString());
      if (!scheduled_at) return;
      payload.scheduled_at = scheduled_at;
    }
    run('review_approval', payload, decision === 'edit' ? 'Edited version saved and fresh approval requested.' : `Request ${decision === 'reject' ? 'rejected' : 'approved'}. No post or reply was sent.`);
  };

  return <div className="space-y-5">
    <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-accent">HC Apparel Marketing Agent</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Facebook + Pinterest content operations</h1><p className="mt-2 max-w-3xl text-sm text-primary-foreground/80">Private asset intake, verified catalog facts, platform-specific drafts, human approval, campaign-scoped scheduling, traceable retries, and Eastern Time planning.</p></div><Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={load} disabled={Boolean(busy)}><RefreshCw className={`mr-2 h-4 w-4 ${busy === 'load' ? 'animate-spin' : ''}`} />Refresh</Button></div></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {notice && <p className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{notice}</p>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="p-4"><p className="text-xs font-black uppercase text-muted-foreground">Buffer</p><p className="mt-2 font-black">{data.buffer_configured ? 'Connected' : 'Not connected'}</p>{data.buffer_error && <p className="mt-1 text-xs text-red-700">{data.buffer_error}</p>}</Card>
      <Card className="p-4"><p className="text-xs font-black uppercase text-muted-foreground">Facebook Pages</p><p className="mt-2 font-black">{facebookChannels.length}</p><p className="text-xs text-muted-foreground">Select a Page per campaign or post.</p></Card>
      <Card className="p-4"><p className="text-xs font-black uppercase text-muted-foreground">Pinterest accounts</p><p className="mt-2 font-black">{pinterestChannels.length}</p><p className="text-xs text-muted-foreground">Boards come from the connected business account.</p></Card>
      <Card className="p-4"><p className="text-xs font-black uppercase text-muted-foreground">Interaction boundary</p><p className="mt-2 font-black">Messenger not connected</p><p className="text-xs text-muted-foreground">Buffer publishing access does not authorize incoming chats or replies.</p></Card>
    </section>

    <Section title="Approval-first Facebook workflow" description="Pictures, quotes, post drafts, and reply drafts remain separate by Page. Email links only open this authenticated review; they never approve or send content.">
      <div className="grid gap-3 md:grid-cols-2">{(data.page_scopes || []).map(scope => <Card className="p-4" key={scope.page_key}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black">{scope.display_name}</h3><span className={`rounded-full px-2 py-1 text-xs font-bold ${scope.posting_status === 'connected' ? 'bg-green-100 text-green-800' : scope.posting_status === 'paused' ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-900'}`}>{scope.posting_status === 'connected' ? 'Posting connected' : scope.posting_status === 'paused' ? 'Paused — setup preserved' : 'Posting authorization needed'}</span></div><p className="mt-2 text-sm text-muted-foreground">Expected Facebook Page: {scope.expected_channel_name}</p><p className="mt-1 text-sm">{scope.posting_status === 'paused' ? 'No upgrade or paid trial is required while this Page is paused.' : scope.matched_channel ? `Authorized channel: ${scope.matched_channel.name}` : 'This Page was not found among the current Buffer Facebook channels.'}</p><p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs"><b>Messaging:</b> Separate Meta Messenger authorization required; no connection will be added without reviewing any cost first.</p></Card>)}</div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border p-4"><SelectField label="Page" value={approvalDraft.page_key} onChange={value => setApprovalDraft(current => ({ ...current, page_key: value }))}><option value="hc_apparel">HC Apparel</option><option value="chatha_al_terik" disabled>Chatha Al-Terik — paused</option></SelectField><SelectField label="Approval type" value={approvalDraft.request_type} onChange={value => setApprovalDraft(current => ({ ...current, request_type: value, source_kind: value === 'chat_reply' ? 'incoming_chat' : current.page_key === 'chatha_al_terik' ? 'quote' : 'photo' }))}><option value="post">Facebook post</option><option value="chat_reply">Page chat reply draft</option></SelectField><TextArea label={approvalDraft.page_key === 'chatha_al_terik' ? 'Submitted quote / source material' : 'Verified facts or source material'} value={approvalDraft.source_material} onChange={value => setApprovalDraft(current => ({ ...current, source_material: value }))} /><TextArea label="Proposed content" value={approvalDraft.proposed_content} onChange={value => setApprovalDraft(current => ({ ...current, proposed_content: value }))} rows={6} />{approvalDraft.request_type === 'chat_reply' && <><Field label="Conversation reference" value={approvalDraft.conversation_id} onChange={value => setApprovalDraft(current => ({ ...current, conversation_id: value }))} /><Field label="Latest incoming message reference" value={approvalDraft.incoming_message_id} onChange={value => setApprovalDraft(current => ({ ...current, incoming_message_id: value }))} /></>}<p className="text-xs text-muted-foreground">Use the private image uploader below for an optional picture. Chat drafts can be reviewed now, but cannot be sent until Messenger permissions are connected.</p><Button disabled={!approvalDraft.proposed_content || Boolean(busy)} onClick={requestApproval}>Request authenticated approval</Button></div>
        <div><h3 className="font-black">Approval queue</h3><div className="mt-3 space-y-3">{(data.approvals || []).length ? data.approvals.map(item => { const scope = data.page_scopes?.find(page => page.page_key === item.page_key); const notification = data.notifications?.find(row => row.approval_request_id === item.id && row.content_version === item.content_version); return <article id={`approval-${item.id}`} key={item.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><b>{scope?.display_name || item.page_key} · {item.request_type === 'chat_reply' ? 'Chat reply' : 'Post'}</b><StatePill state={item.status} /></div><p className="mt-1 text-xs text-muted-foreground">Version {item.content_version} · Email {notification?.status || 'not requested'}</p><p className="mt-3 whitespace-pre-wrap text-sm">{item.proposed_content}</p>{item.image_url && <img src={item.image_url} alt="Proposed content preview" className="mt-3 max-h-52 w-full rounded-lg border bg-muted object-contain" />}{item.status === 'pending' && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => reviewApproval(item, 'approve')}>Approve exact version</Button><Button size="sm" variant="outline" onClick={() => reviewApproval(item, 'edit')}>Edit</Button><Button size="sm" variant="outline" onClick={() => reviewApproval(item, 'schedule')} disabled={item.request_type !== 'post'}>Approve & add to calendar</Button><Button size="sm" variant="destructive" onClick={() => reviewApproval(item, 'reject')}>Reject</Button></div>}{item.request_type === 'chat_reply' && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs">Not sendable: incoming Page messaging is not connected. A newer incoming message must mark this draft outdated before review.</p>}</article>; }) : <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">No approval requests yet.</p>}</div></div>
      </div>
    </Section>

    <Section title={campaign.id ? 'Edit campaign authorization' : 'Create a campaign'} description="Default is planning-only. Automatic publishing is limited to the exact platforms, frequency, date window, connected destinations, and Eastern Time settings confirmed here.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Campaign name" value={campaign.campaign} onChange={value => changeCampaign('campaign', value)} /><Field label="Tracking key" value={campaign.campaign_key} onChange={value => changeCampaign('campaign_key', value)} placeholder="fall_team_apparel" /><Field label="Start date" type="date" value={campaign.start_date} onChange={value => changeCampaign('start_date', value)} /><Field label="End date" type="date" value={campaign.end_date} onChange={value => changeCampaign('end_date', value)} /><Field label="Posts per week" type="number" min="1" max="14" value={campaign.publishing_frequency_per_week} onChange={value => changeCampaign('publishing_frequency_per_week', value)} /><SelectField label="Facebook Page" value={campaign.facebook_channel_id} onChange={value => changeCampaign('facebook_channel_id', value)}><option value="">Choose later</option>{facebookChannels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</SelectField><SelectField label="Pinterest account" value={campaign.pinterest_channel_id} onChange={value => { changeCampaign('pinterest_channel_id', value); changeCampaign('pinterest_board_id', ''); }}><option value="">Choose later</option>{pinterestChannels.map(channel => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</SelectField><SelectField label="Pinterest board" value={campaign.pinterest_board_id} onChange={value => { const board = (selectedPinterest?.boards || []).find(item => item.serviceId === value); setCampaign(current => ({ ...current, pinterest_board_id: value, pinterest_board_name: board?.name || '' })); }}><option value="">Choose later</option>{(selectedPinterest?.boards || []).map(board => <option key={board.serviceId} value={board.serviceId}>{board.name}</option>)}</SelectField></div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2"><TextArea label="Campaign goal" value={campaign.goal} onChange={value => changeCampaign('goal', value)} rows={3} /><TextArea label="Creative notes" value={campaign.campaign_notes} onChange={value => changeCampaign('campaign_notes', value)} rows={3} /></div>
      <fieldset className="mt-4"><legend className="text-xs font-black text-muted-foreground">Authorized platforms</legend><div className="mt-2 flex flex-wrap gap-4">{['facebook', 'pinterest'].map(platform => <label key={platform} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold capitalize"><input type="checkbox" checked={campaign.platforms.includes(platform)} onChange={() => changeCampaign('platforms', campaign.platforms.includes(platform) ? campaign.platforms.filter(value => value !== platform) : [...campaign.platforms, platform])} />{platform}</label>)}</div></fieldset>
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><input className="mt-1" type="checkbox" checked={campaign.automatic_publishing_enabled} onChange={event => changeCampaign('automatic_publishing_enabled', event.target.checked)} /><span><b>Authorize campaign-scoped automatic scheduling</b><span className="mt-1 block text-amber-900/80">Off by default. Approval is still required for every post. Turning this on permits the agent to hand already-approved posts to the selected channels only inside this campaign’s date and frequency scope.</span></span></label>
      <div className="mt-4 flex flex-wrap gap-2"><Button onClick={saveCampaign} disabled={busy === 'campaign'}>{busy === 'campaign' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{campaign.id ? 'Save campaign' : 'Create campaign'}</Button>{campaign.id && <Button variant="outline" onClick={() => setCampaign(emptyCampaign)}>Cancel edit</Button>}</div>
      {data.campaigns.length > 0 && <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.campaigns.map(item => <article className="rounded-xl border p-4" key={item.id}><div className="flex items-start justify-between gap-2"><div><h3 className="font-black">{item.campaign}</h3><p className="text-xs text-muted-foreground">{(item.platforms || []).join(' + ') || 'No platforms'} · {item.publishing_timezone || 'America/New_York'}</p></div><StatePill state={item.status} /></div><p className="mt-2 text-sm">{item.goal || 'Goal not set'}</p><p className="mt-2 text-xs font-semibold">{item.automatic_publishing_enabled ? `Authorized ${item.start_date}–${item.end_date} · ${item.publishing_frequency_per_week}/week` : 'Manual approval and scheduling'}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setSelectedCampaignId(item.id); editCampaign(item); }}>Edit</Button><Button size="sm" variant={selectedCampaignId === item.id ? 'default' : 'outline'} onClick={() => setSelectedCampaignId(item.id)}>{selectedCampaignId === item.id ? 'Selected' : 'Use campaign'}</Button>{item.automatic_publishing_enabled && item.status === 'Active' && <Button size="sm" variant="outline" onClick={() => run('schedule_campaign', { campaign_id: item.id }, 'Approved campaign posts were processed; review any per-post failures below.')}>Schedule approved</Button>} {!['Cancelled', 'Archived', 'Completed'].includes(item.status) && <Button size="sm" variant="destructive" onClick={() => window.confirm('Emergency stop this campaign and remove every queued post that can be confirmed?') && run('emergency_stop', { campaign_id: item.id, confirmed: true }, 'Campaign stopped. Review the cancellation results and Buffer queue.') }><PauseCircle className="mr-1 h-4 w-4" />Stop</Button>}</div></article>)}</div>}
    </Section>

    <Section title="Create platform drafts" description="Select a live product or upload an original. Digital mockups always use their public watermarked preview. Uploaded originals stay private; only a separate derivative is publishable.">
      <div className="grid gap-5 lg:grid-cols-2"><div className="space-y-4"><div className="flex gap-2"><Field label="Find a live product" value={productQuery} onChange={setProductQuery} placeholder="Product, brand, or style" /><Button className="self-end" variant="outline" onClick={searchProducts} disabled={busy === 'search'}><Search className="mr-1 h-4 w-4" />Search</Button></div>{products.length > 0 && <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border p-2">{products.map(product => <button type="button" onClick={() => setSelectedProduct(product)} key={`${product.kind}-${product.id}-${product.asset_id || ''}`} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${selectedProduct?.id === product.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>{product.image_url ? <img className="h-14 w-14 rounded-md bg-muted object-contain" src={product.image_url} alt="" /> : <FileImage className="h-10 w-10 text-muted-foreground" />}<span className="min-w-0 flex-1"><b className="block truncate text-sm">{product.name}</b><span className="block text-xs text-muted-foreground">{product.kind === 'digital' ? 'Digital mockup · watermarked preview' : `${product.brand || 'Apparel'} ${product.style || ''}`} · {money(product.price)} · {product.available ? 'Available' : 'Unavailable'}</span></span>{selectedProduct?.id === product.id && <Check className="h-5 w-5 text-primary" />}</button>)}</div>}<label className="block rounded-xl border border-dashed p-4 text-center text-sm font-bold hover:bg-muted"><Upload className="mx-auto mb-2 h-6 w-6 text-primary" />Upload private original<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => upload(event.target.files?.[0])} /></label>{asset && <div className="flex items-center gap-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{assetPreview && <img className="h-16 w-16 rounded object-cover" src={assetPreview} alt="Local preview of private upload" />}<span><b>{asset.filename}</b><br />Private original saved; derivative not created until draft generation.</span></div>}</div>
        <div className="space-y-3"><SelectField label="Campaign" value={selectedCampaignId} onChange={setSelectedCampaignId}><option value="">Select campaign</option>{data.campaigns.filter(item => !['Completed', 'Archived', 'Cancelled'].includes(item.status)).map(item => <option key={item.id} value={item.id}>{item.campaign}</option>)}</SelectField><Field label="CTA" value={brief.cta} onChange={value => setBrief(current => ({ ...current, cta: value }))} /><Field label="Destination override (optional HC Apparel URL)" value={brief.destination_url} onChange={value => setBrief(current => ({ ...current, destination_url: value }))} placeholder="Defaults to selected product or Shop Garments" /><TextArea label="Creative direction" value={brief.notes} onChange={value => setBrief(current => ({ ...current, notes: value }))} rows={5} placeholder="Audience, season, goal, and visual context. Product facts are reverified server-side." /><fieldset><legend className="text-xs font-black text-muted-foreground">Draft platforms</legend><div className="mt-2 flex gap-3">{['facebook', 'pinterest'].map(platform => <label key={platform} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold capitalize"><input type="checkbox" checked={brief.platforms.includes(platform)} onChange={() => changeBriefPlatform(platform)} />{platform}</label>)}</div></fieldset><Button className="w-full" disabled={!selectedCampaignId || !brief.platforms.length || (!selectedProduct && !asset) || busy === 'generate_drafts'} onClick={generate}>{busy === 'generate_drafts' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}Create Drafts</Button><p className="text-xs text-muted-foreground">Generation creates Draft records only. Prices, availability, offers, destination, and the publishing image are revalidated again before scheduling.</p></div></div>
    </Section>

    <Section title="Review and publishing queue" description="Draft → Approved → Scheduled → Publishing → Published, with Failed and Cancelled states. All channel times use America/New_York.">
      {currentCampaign ? <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3"><p className="text-sm"><b>{currentCampaign.campaign}</b> · {campaignPosts.length} post(s)</p><StatePill state={currentCampaign.status} /></div> : <p className="mb-4 text-sm text-muted-foreground">Select a campaign to review its posts.</p>}
      {campaignPosts.length ? <div className="grid gap-4 xl:grid-cols-2">{campaignPosts.map(post => <PostReview key={post.id} post={post} channels={data.channels} onRun={run} />)}</div> : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No agent drafts in this campaign.</p>}
    </Section>

    <Section title="Trend and audience evidence" description="Store only source-backed, aggregate research. Label observations separately from experiments; never identify or contact individuals.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><SelectField label="Source type" value={research.source_type} onChange={value => setResearch(current => ({ ...current, source_type: value }))}><option>Official Platform</option><option>Platform Insight</option><option>Public Research</option></SelectField><Field label="Source title" value={research.source_title} onChange={value => setResearch(current => ({ ...current, source_title: value }))} /><Field label="Source URL" value={research.source_url} onChange={value => setResearch(current => ({ ...current, source_url: value }))} /><Field label="Observed date" type="date" value={research.observed_at} onChange={value => setResearch(current => ({ ...current, observed_at: value }))} /><SelectField label="Recommendation label" value={research.recommendation_type} onChange={value => setResearch(current => ({ ...current, recommendation_type: value }))}><option>Observed evidence</option><option>Experiment</option></SelectField><Field label="Keywords" value={research.keywords} onChange={value => setResearch(current => ({ ...current, keywords: value }))} placeholder="team apparel, fall, creators" /><TextArea label="Evidence summary" value={research.evidence_summary} onChange={value => setResearch(current => ({ ...current, evidence_summary: value }))} /><TextArea label="How it fits available assets" value={research.asset_fit} onChange={value => setResearch(current => ({ ...current, asset_fit: value }))} /><TextArea label="Aggregate audience only" value={research.aggregate_audience} onChange={value => setResearch(current => ({ ...current, aggregate_audience: value }))} /></div><Button className="mt-4" onClick={saveResearch}>Save research</Button>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.research.map(item => <article className="rounded-xl border p-4" key={item.id}><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black uppercase text-primary">{item.recommendation_type}</span><span className="text-xs text-muted-foreground">{new Date(item.observed_at).toLocaleDateString()}</span></div><h3 className="mt-2 font-black">{item.source_title}</h3><p className="mt-2 text-sm">{item.evidence_summary}</p><a className="mt-3 inline-flex items-center text-xs font-bold text-primary underline" href={item.source_url} target="_blank" rel="noreferrer">Open source <ExternalLink className="ml-1 h-3 w-3" /></a></article>)}</div>
    </Section>

    <Section title="Safety and capability boundaries" description="These are enforced server-side, not just advisory UI text."><div className="grid gap-3 md:grid-cols-2"><p className="flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-900"><ShieldCheck className="h-5 w-5 shrink-0" /><span><b>Enabled:</b> private asset intake, customer-safe derivatives, live catalog verification, Facebook/Pinterest drafts, approval, scheduling, cancellation, retries, platform request IDs, and status refresh.</span></p><p className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="h-5 w-5 shrink-0" /><span><b>Not enabled:</b> replies to incoming comments, other-account comments, DMs, individual targeting, fabricated metrics, or an unattended live test post. Standalone comments are not exposed because the connected publishing API does not support the required own-post-only guardrail.</span></p></div><p className="mt-3 text-xs text-muted-foreground">{data.metrics_policy}</p></Section>
  </div>;
}
