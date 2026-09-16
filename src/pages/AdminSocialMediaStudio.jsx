import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2, Copy, ImagePlus, Loader2, Save, Send, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const OPTIONS = {
  platform: [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['x', 'X'], ['pinterest', 'Pinterest'], ['tiktok', 'TikTok'], ['linkedin', 'LinkedIn'], ['youtube', 'YouTube'], ['threads', 'Threads'], ['bluesky', 'Bluesky'], ['google', 'Google Business Profile']],
  content_type: ['Product Promo', 'Brand Promo', 'Sale Post', 'New Arrival', 'Seasonal Post', 'Bulk Order', 'Custom Printing'],
  category: [['', 'All Apparel Blanks'], ['t_shirts', 'T-Shirts'], ['hoodies', 'Hoodies'], ['fleece', 'Fleece'], ['outerwear', 'Outerwear'], ['hats', 'Hats'], ['bags', 'Bags'], ['tank_tops', 'Tank Tops'], ['womens', "Women's Styles"], ['sportswear', 'Sports / Activewear'], ['crewnecks', 'Crewnecks / Sweatshirts'], ['long_sleeve', 'Long Sleeve'], ['polos', 'Polos']],
  brand: ['HC Apparel', 'Shaka Wear', 'Champion', 'Columbia', 'Bella + Canvas', 'Gildan', 'Comfort Colors', 'Next Level', 'Independent Trading Co.', 'Port & Company', 'Hanes', 'District', 'Rabbit Skins', 'Lane Seven', 'adidas', 'Oakley'],
  tone: ['professional', 'bold', 'clean', 'modern', 'premium', 'streetwear'],
  audience: ['brands', 'teams', 'creators', 'churches', 'schools', 'businesses'],
  caption_length: ['short', 'medium', 'long'],
  cta: ['Shop Blanks', 'Order Blanks', 'Request Bulk Quote', 'Start Your Brand', 'Explore Collection'],
};

const INITIAL = {
  platform: 'instagram', content_type: 'Product Promo', brand: 'HC Apparel', category: '',
  product_id: '', product_image_index: -1, product_color: '', image_mode: 'product', tone: 'professional', audience: 'creators',
  caption_length: 'medium', cta: 'Shop Blanks', include_hashtags: true, notes: '',
};

const statusLabel = {
  draft: 'Draft', sent_to_buffer: 'Sent to Buffer', scheduled: 'Scheduled', posted: 'Posted',
};
const platformName = service => ({ twitter: 'X', tiktok: 'TikTok', linkedin: 'LinkedIn', youtube: 'YouTube', googlebusiness: 'Google Business Profile', googlebusinessprofile: 'Google Business Profile' }[service] || service?.replace(/^./, letter => letter.toUpperCase()) || 'Unknown');
const platformService = platform => platform === 'x' ? 'twitter' : platform === 'google' ? 'googlebusiness' : platform;

const displayImage = url => url?.startsWith('Images/') || url?.startsWith('/Images/')
  ? `https://www.ssactivewear.com/${url.replace(/^\//, '')}` : url;
const productColors = product => (Array.isArray(product?.available_colors) ? product.available_colors : [])
  .map(item => typeof item === 'string' ? item : item?.name || item?.color_name || item?.color || '')
  .filter(Boolean);
const selectedCatalogImage = (product, color) => color
  ? (Array.isArray(product?.size_prices) ? product.size_prices.find(item => String(item?.size || '').startsWith(`${color} /`) && item?.image_url)?.image_url : '')
  : product?.image_url;

async function studio(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke('social-media-studio', { body: { action, ...payload } });
  if (error) {
    let message = error.message || 'Studio request failed.';
    try { message = (await error.context?.json())?.error || message; } catch { /* Keep the transport error. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function Field({ label, children }) {
  return <label className="block min-w-0 text-sm font-medium text-foreground">{label}<div className="mt-1.5">{children}</div></label>;
}

function SelectField({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      <select value={value} onChange={event => onChange(event.target.value)} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm">
        {options.map(option => {
          const [key, text] = Array.isArray(option) ? option : [option, option];
          return <option key={key} value={key}>{text}</option>;
        })}
      </select>
    </Field>
  );
}

export default function AdminSocialMediaStudio() {
  const [form, setForm] = useState(INITIAL);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productMatches, setProductMatches] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [artwork, setArtwork] = useState(null);
  const [posts, setPosts] = useState([]);
  const [post, setPost] = useState(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [status, setStatus] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [channelId, setChannelId] = useState('');
  const [boardId, setBoardId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [scheduleChoice, setScheduleChoice] = useState('time');
  const [scheduleAt, setScheduleAt] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const loadHistory = async () => {
    const { data, error: loadError } = await supabase.from('social_studio_posts')
      .select('id,created_at,platform,content_type,brand,category,product_id,product_name,source_image_url,image_url,image_mode,artwork_path,caption,hashtags,image_prompt,status,buffer_post_id,scheduled_at')
      .order('created_at', { ascending: false }).limit(50);
    if (loadError) throw new Error('Could not load post history. Apply the Studio database migration.');
    setPosts(data || []);
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('social_studio_posts').select('id,created_at,platform,content_type,brand,category,product_id,product_name,source_image_url,image_url,image_mode,artwork_path,caption,hashtags,image_prompt,status,buffer_post_id,scheduled_at').order('created_at', { ascending: false }).limit(50),
      studio('status'),
    ]).then(([history, settings]) => {
      if (!active) return;
      if (history.error) throw new Error('Could not load post history. Apply the Studio database migration.');
      setPosts(history.data || []);
      setStatus(settings);
    }).catch(issue => { if (active) setError(issue.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (productSearch.trim().length < 2) { setProductMatches([]); return; }
    let active = true;
    const timer = setTimeout(() => {
      studio('search_products', { query: productSearch }).then(result => {
        if (active) setProductMatches(result.products || []);
      }).catch(issue => { if (active) setError(issue.message); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [productSearch]);

  const imageChoices = [selectedProduct?.image_url, ...(Array.isArray(selectedProduct?.mockup_images) ? selectedProduct.mockup_images : [])]
    .map(item => typeof item === 'string' ? item : item?.image_url || item?.url || item?.src || '')
    .filter(Boolean);
  const channels = status?.channels || [];
  const selectedChannel = channels.find(channel => channel.id === channelId);
  const matchingChannel = selectedChannel && (selectedChannel.service === platformService(form.platform) || (form.platform === 'google' && selectedChannel.service === 'googlebusinessprofile'));
  const xLength = [caption.trim(), hashtags.trim()].filter(Boolean).join('\n\n').length;
  const requiredFieldsComplete = Boolean(post && post.status === 'draft' && caption.trim() && selectedChannel && matchingChannel && !selectedChannel.isDisconnected && !selectedChannel.isLocked && (form.platform !== 'pinterest' || (post.image_url && selectedChannel.boards?.some(board => board.serviceId === boardId))) && form.platform !== 'youtube' && (form.platform !== 'tiktok' || post.image_url) && (form.platform !== 'x' || xLength <= 280));
  const scheduleReady = scheduleChoice === 'queue' || (scheduleAt && new Date(scheduleAt).getTime() > Date.now());
  const dirty = Boolean(post && (caption !== post.caption || hashtags !== post.hashtags || imagePrompt !== post.image_prompt));

  const choosePost = item => {
    setPost(item);
    setCaption(item.caption || '');
    setHashtags(item.hashtags || '');
    setImagePrompt(item.image_prompt || '');
    setForm(current => ({ ...current, platform: item.platform, category: item.category || '', brand: item.brand || 'HC Apparel', product_id: '', image_mode: item.image_mode || 'lifestyle' }));
    setSelectedProduct(null);
    setArtwork(item.artwork_path ? { path: item.artwork_path, url: item.image_url } : null);
    setChannelId('');
    setBoardId('');
    setConfirmed(false);
    setError('');
    setNotice('');
  };

  const run = async (task, work) => {
    setBusy(task); setError(''); setNotice('');
    try { await work(); } catch (issue) { setError(issue.message || 'Request failed.'); }
    finally { setBusy(''); }
  };

  const generate = () => run('generate', async () => {
    const result = await studio('generate', { ...form, artwork_path: form.image_mode === 'artwork' ? artwork?.path : null });
    choosePost(result.post);
    await loadHistory();
    setNotice(form.image_mode === 'artwork' ? 'Your artwork and AI-generated copy are saved as a private HC Apparel draft.' : form.image_mode === 'product' ? 'AI copy and a real catalog image are saved as a private draft.' : 'Lifestyle image and AI copy are saved as a private draft. Review before Buffer handoff.');
  });

  const uploadArtwork = file => run('upload', async () => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Choose a PNG, JPG/JPEG, or WEBP image under 10 MB.');
    const body = new FormData();
    body.append('action', 'upload_artwork');
    body.append('file', file);
    const { data, error: uploadError } = await supabase.functions.invoke('social-media-studio', { body });
    if (uploadError || data?.error) throw new Error(data?.error || uploadError?.message || 'Artwork upload failed.');
    setArtwork(data);
    set('image_mode', 'artwork');
    if (post?.status === 'draft') {
      const result = await studio('replace_artwork', { post_id: post.id, artwork_path: data.path });
      choosePost(result.post);
      await loadHistory();
      setNotice('Artwork uploaded and attached to this private draft.');
    } else setNotice('Artwork uploaded. Generate a draft to attach AI caption and hashtags.');
  });

  const duplicateDraft = item => run('duplicate', async () => {
    const result = await studio('duplicate_draft', { post_id: item.id });
    choosePost(result.post);
    await loadHistory();
    setNotice('Private draft duplicated. Review the copy and channel before any Buffer handoff.');
  });

  const deleteDraft = item => {
    if (!window.confirm('Delete this social draft? This cannot be undone.')) return;
    run('delete', async () => {
      await studio('delete_draft', { post_id: item.id });
      if (post?.id === item.id) { setPost(null); setCaption(''); setHashtags(''); setImagePrompt(''); setArtwork(null); }
      await loadHistory();
      setNotice('Selected private draft deleted. Uploaded media is retained for audit and not attached to another post automatically.');
    });
  };

  const saveDraft = async () => {
    if (!post) throw new Error('Generate or open a post first.');
    if (!caption.trim()) throw new Error('Caption cannot be empty.');
    const { data, error: saveError } = await supabase.from('social_studio_posts').update({
      caption: caption.trim(), hashtags: hashtags.trim(), image_prompt: imagePrompt.trim(), updated_at: new Date().toISOString(),
    }).eq('id', post.id).eq('status', 'draft').select().single();
    if (saveError || !data) throw new Error('Could not save the draft. Only local drafts are editable.');
    choosePost(data);
    await loadHistory();
    return data;
  };

  const send = mode => run(mode, async () => {
    if (!post) throw new Error('Generate or open a post first.');
    if (!channelId || !selectedChannel) throw new Error('Choose a Buffer channel for this platform.');
    if (!matchingChannel || !requiredFieldsComplete || !confirmed) throw new Error('Complete the platform requirements and confirm this Buffer handoff.');
    if (selectedChannel.isDisconnected || selectedChannel.isLocked) throw new Error('The selected Buffer channel is unavailable.');
    if (form.platform === 'x' && xLength > 280) throw new Error('X posts must be 280 characters or less, including hashtags.');
    if (mode === 'schedule' && !scheduleReady) throw new Error('Choose a future date/time or explicitly choose the next Buffer queue slot.');
    const saved = dirty ? await saveDraft() : post;
    const result = await studio('send_buffer', {
      post_id: saved.id, channel_id: channelId, pinterest_board_id: boardId, confirmed: true, mode,
      scheduled_at: mode === 'schedule' && scheduleChoice === 'time' ? new Date(scheduleAt).toISOString() : null,
      queue_next: mode === 'schedule' && scheduleChoice === 'queue',
    });
    choosePost(result.post);
    await loadHistory();
    setNotice(mode === 'draft' ? 'Sent to Buffer Drafts. Nothing was scheduled or published.' : 'Scheduled in Buffer. It was not published immediately.');
  });

  const connectBuffer = () => run('connect', async () => {
    const result = await studio('connect_buffer', { api_key: apiKey });
    setApiKey('');
    setStatus({ ...(status || {}), buffer_configured: true, channels: result.channels, buffer_error: '' });
    setNotice('Buffer connected. Choose a channel when sending a reviewed post.');
  });

  const refreshBufferPost = () => run('refresh', async () => {
    if (!post?.buffer_post_id) throw new Error('This post has not been sent to Buffer.');
    const result = await studio('refresh_buffer_status', { post_id: post.id });
    choosePost(result.post);
    await loadHistory();
    setNotice(`Buffer reports: ${result.buffer_status}.`);
  });

  return (
    <div className="min-h-screen bg-[#f6f3ea] pb-12">
      <header className="bg-primary px-4 py-6 text-primary-foreground">
        <div className="container mx-auto max-w-7xl">
          <Link to="/AdminDashboard" className="mb-3 inline-flex items-center gap-1 text-sm text-primary-foreground/75 hover:text-white"><ArrowLeft className="h-4 w-4" />Admin Dashboard</Link>
          <div className="flex items-center gap-3"><Sparkles className="h-7 w-7 text-accent" /><div><h1 className="text-2xl font-bold">Social Media Studio</h1><p className="text-sm text-primary-foreground/75">Create, refine, and hand off HC Apparel posts to Buffer.</p></div></div>
        </div>
      </header>
      <main className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <Card className="min-w-0 border-stone-200 shadow-sm">
            <CardHeader><CardTitle className="text-lg">Create a post</CardTitle><p className="text-sm text-muted-foreground">Choose the campaign details. Generation saves a private draft; it never publishes automatically.</p></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Platform" value={form.platform} options={OPTIONS.platform} onChange={value => { set('platform', value); setChannelId(''); setBoardId(''); setConfirmed(false); }} />
                <SelectField label="Content type" value={form.content_type} options={OPTIONS.content_type} onChange={value => set('content_type', value)} />
                <SelectField label="Brand" value={form.brand} options={OPTIONS.brand} onChange={value => set('brand', value)} />
                <SelectField label="Category" value={form.category} options={OPTIONS.category} onChange={value => set('category', value)} />
                <SelectField label="Tone" value={form.tone} options={OPTIONS.tone} onChange={value => set('tone', value)} />
                <SelectField label="Audience" value={form.audience} options={OPTIONS.audience} onChange={value => set('audience', value)} />
                <SelectField label="Caption length" value={form.caption_length} options={OPTIONS.caption_length} onChange={value => set('caption_length', value)} />
                <SelectField label="Call to action" value={form.cta} options={OPTIONS.cta} onChange={value => set('cta', value)} />
                <label className="flex items-center gap-2 self-end rounded-md border border-input bg-white px-3 py-2.5 text-sm"><input type="checkbox" checked={form.include_hashtags} onChange={event => set('include_hashtags', event.target.checked)} />Include hashtags</label>
              </div>
              <div className="rounded-xl border bg-stone-50 p-4">
                <Field label="Find an existing product (optional)"><Input type="search" name="studio-catalog-product-search" autoComplete="off" value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Search product name, brand, or style" /></Field>
                {selectedProduct && <div className="mt-2 flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium">Selected: {selectedProduct.name}</span><button type="button" className="text-primary underline" onClick={() => { setSelectedProduct(null); setForm(current => ({ ...current, product_id: '', product_image_index: -1, product_color: '' })); }}>Clear</button></div>}
                {productMatches.length > 0 && <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border bg-white">{productMatches.map(item => <button key={item.id} type="button" onClick={() => { setSelectedProduct(item); setForm(current => ({ ...current, product_id: String(item.id), product_image_index: -1, product_color: '', image_mode: 'product' })); setProductSearch(''); setProductMatches([]); }} className="flex w-full items-center gap-3 border-b px-3 py-2 text-left text-sm hover:bg-muted"><span className="h-12 w-12 shrink-0 overflow-hidden rounded bg-stone-100">{item.image_url && <img src={displayImage(item.image_url)} alt="" className="h-full w-full object-contain" />}</span><span className="min-w-0"><span className="block truncate font-medium">{item.name}</span><span className="block truncate text-xs text-muted-foreground">{item.brand || item.vendor_source || 'Catalog'} · {item.category || 'Apparel'} · {item.supplier_sku || 'No style number'}</span></span></button>)}</div>}
                {selectedProduct && productColors(selectedProduct).length > 0 && <div className="mt-4"><SelectField label="Product color (optional)" value={form.product_color} options={[['', 'No color selected'], ...productColors(selectedProduct).map(color => [color, color])]} onChange={value => set('product_color', value)} /></div>}
                <div className="mt-4"><SelectField label="Post image" value={form.image_mode} options={[["product", "Use Product Image"], ["artwork", "Upload My Artwork"], ["lifestyle", "Generate Lifestyle Image"]]} onChange={value => set('image_mode', value)} /><p className="mt-1 text-xs text-muted-foreground">{form.image_mode === 'artwork' ? 'Your uploaded artwork is used as-is. OpenAI generates copy only.' : selectedProduct ? form.image_mode === 'product' ? 'Uses the selected product’s actual catalog image. OpenAI generates copy only.' : 'Generates a lifestyle image based on the real product and selected catalog color.' : form.image_mode === 'product' ? 'Uses a real, representative live catalog image for the selected category or brand. If none is available, choose another category or explicitly select Generate Lifestyle Image.' : 'Generates an optional lifestyle image for the selected category or brand.'}</p></div>
                <div className="mt-3"><label className="block text-sm font-medium">Upload My Artwork <span className="font-normal text-muted-foreground">(PNG, JPG/JPEG, WEBP · up to 10 MB)</span><Input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" className="mt-2" onChange={event => { const file = event.target.files?.[0]; if (file) uploadArtwork(file); event.target.value = ''; }} disabled={Boolean(busy)} /></label>{artwork?.url && <div className="mt-2 flex items-center gap-3 rounded-lg border bg-white p-2 text-xs"><img src={artwork.url} alt="Uploaded artwork preview" className="h-16 w-16 object-contain" /><span>Uploaded artwork ready{post?.image_mode === 'artwork' ? ' and attached to this draft' : ''}.</span></div>}</div>
                {selectedProduct && form.image_mode === 'product' && <div className="mt-3 flex items-center gap-3 rounded-lg border bg-white p-2 text-xs"><div className="h-16 w-16 shrink-0 overflow-hidden rounded bg-stone-100">{selectedCatalogImage(selectedProduct, form.product_color) && <img src={displayImage(selectedCatalogImage(selectedProduct, form.product_color))} alt="Catalog product in selected color" className="h-full w-full object-contain" />}</div><span>{selectedCatalogImage(selectedProduct, form.product_color) ? `${form.product_color ? 'Actual catalog image for ' + form.product_color : 'Actual primary product image'} · saved with this draft` : 'No image matches this color. Choose another color or use lifestyle mode.'}</span></div>}
                {selectedProduct && form.image_mode === 'lifestyle' && <div className="mt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lifestyle image reference</p><div className="flex flex-wrap gap-2"><button type="button" onClick={() => set('product_image_index', -1)} className={`rounded-lg border px-3 py-2 text-xs ${form.product_image_index === -1 ? 'border-primary bg-primary/10' : 'bg-white'}`}>Use primary image</button>{imageChoices.map((url, index) => <button key={`${url}-${index}`} type="button" onClick={() => set('product_image_index', index)} className={`h-16 w-16 overflow-hidden rounded-lg border-2 bg-white ${form.product_image_index === index ? 'border-accent' : 'border-transparent'}`} title={`Reference image ${index + 1}`}><img src={displayImage(url)} alt={`Product reference ${index + 1}`} className="h-full w-full object-contain" /></button>)}</div></div>}
              </div>
              <Field label="Custom instructions (optional)"><Textarea value={form.notes} onChange={event => set('notes', event.target.value)} maxLength={1000} rows={3} placeholder="Campaign angle, specific product qualities, approved offer details…" /></Field>
              <Button type="button" onClick={generate} disabled={Boolean(busy) || status?.openai_configured === false || (form.image_mode === 'artwork' && !artwork?.path) || (selectedProduct && form.image_mode === 'product' && !selectedCatalogImage(selectedProduct, form.product_color))} className="w-full gap-2 bg-primary text-primary-foreground"><ImagePlus className="h-4 w-4" />{busy === 'generate' ? 'Creating private draft…' : 'Generate social draft'}{busy === 'generate' && <Loader2 className="h-4 w-4 animate-spin" />}</Button>
              {status?.openai_configured === false && <p className="text-sm text-amber-800">OpenAI is not configured. Add OPENAI_API_KEY to the Supabase function secrets.</p>}
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-6">
            <Card className="border-stone-200 shadow-sm">
              <CardHeader><CardTitle className="text-lg">Preview &amp; edit</CardTitle><p className="text-sm text-muted-foreground">Square 1:1 creative. Review every image and claim before posting.</p></CardHeader>
              <CardContent className="space-y-4">
                {post ? <>
                  <div className="aspect-square overflow-hidden rounded-xl border bg-[#ece7db]">{post.image_url ? <img src={displayImage(post.image_url)} alt="Social post preview" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-muted-foreground">No image</div>}</div>
                  {post.image_mode === 'artwork' ? <p className="text-xs text-muted-foreground">Your uploaded artwork · saved with this draft</p> : post.image_mode === 'product' ? <p className="text-xs text-muted-foreground">{post.product_id ? 'Actual catalog product image' : 'Representative live catalog image'} · saved with this draft</p> : <p className="text-xs text-muted-foreground">AI-generated lifestyle image · saved with this draft</p>}
                  <Field label="Caption"><Textarea value={caption} onChange={event => setCaption(event.target.value)} rows={6} disabled={post.status !== 'draft'} /></Field>
                  <Field label="Hashtags"><Textarea value={hashtags} onChange={event => setHashtags(event.target.value)} rows={2} disabled={post.status !== 'draft'} /></Field>
                  {form.platform === 'x' && <p className={`text-xs ${xLength > 280 ? 'text-red-700' : 'text-muted-foreground'}`}>X: {xLength}/280 characters, including hashtags</p>}
                  <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Image prompt</summary><Textarea value={imagePrompt} onChange={event => setImagePrompt(event.target.value)} rows={5} disabled={post.status !== 'draft'} className="mt-3" /><p className="mt-2 text-xs text-muted-foreground">Editing this prompt saves the brief but does not regenerate the existing image.</p></details>
                  <Button variant="outline" className="w-full gap-2" onClick={() => run('save', async () => { await saveDraft(); setNotice('Draft saved inside HC Apparel only.'); })} disabled={Boolean(busy) || post.status !== 'draft'}><Save className="h-4 w-4" />Save Draft</Button>
                  {post.status === 'draft' && <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" onClick={() => duplicateDraft(post)} disabled={Boolean(busy)} className="gap-2"><Copy className="h-4 w-4" />Duplicate</Button><Button variant="outline" onClick={() => deleteDraft(post)} disabled={Boolean(busy)} className="gap-2 text-red-700"><Trash2 className="h-4 w-4" />Delete Draft</Button></div>}
                </> : <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 text-center text-sm text-muted-foreground">Generate a post or open one from history to preview it here.</div>}
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-sm">
              <CardHeader id="studio-buffer-handoff"><CardTitle className="text-lg">Buffer handoff</CardTitle><p className="text-sm text-muted-foreground">A HC Apparel draft stays private here. Sending to Buffer Drafts remains unpublished; scheduling requires a separate confirmed action. There is no Publish Now action.</p></CardHeader>
              <CardContent className="space-y-4">
                <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Buffer connection settings</summary><div className="mt-3 space-y-3"><p className="text-xs text-muted-foreground">Connect a Buffer personal API key. It is encrypted by the server and never returned to this page. The Supabase function needs SOCIAL_STUDIO_ENCRYPTION_KEY.</p><Input type="password" autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="Buffer API key" /><Button variant="outline" size="sm" onClick={connectBuffer} disabled={!apiKey || Boolean(busy)}>{busy === 'connect' ? 'Connecting…' : status?.buffer_configured ? 'Replace connection' : 'Connect Buffer'}</Button></div></details>
                <p className="text-xs text-muted-foreground">{status?.buffer_configured ? `${channels.length} connected channel(s) found` : 'Buffer not connected'}{status?.buffer_error ? ` · ${status.buffer_error}` : ''}</p>
                <Field label="Buffer channel"><select value={channelId} onChange={event => { setChannelId(event.target.value); setBoardId(''); setConfirmed(false); }} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Choose a channel</option>{channels.map(channel => <option key={channel.id} value={channel.id} disabled={channel.isDisconnected || channel.isLocked}>{platformName(channel.service)} — {channel.name} ({channel.organization_name}){channel.isDisconnected || channel.isLocked ? ' — unavailable' : ''}</option>)}</select></Field>
                {selectedChannel && !matchingChannel && <p className="text-xs text-amber-800">This channel is visible but the selected draft targets {platformName(platformService(form.platform))}. Choose a matching channel or create a draft for {platformName(selectedChannel.service)}.</p>}
                {selectedChannel?.service === 'pinterest' && <Field label="Pinterest board (required)"><select value={boardId} onChange={event => { setBoardId(event.target.value); setConfirmed(false); }} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Choose a board</option>{(selectedChannel.boards || []).map(board => <option key={board.serviceId} value={board.serviceId}>{board.name}</option>)}</select></Field>}
                {selectedChannel?.service === 'pinterest' && (!selectedChannel.boards?.length || selectedChannel.board_error) && <p className="text-xs text-amber-800">Pinterest board information is unavailable. Buffer handoff is blocked until a board can be selected. {selectedChannel.board_error || ''}</p>}
                {selectedChannel?.service === 'tiktok' && <p className="text-xs text-amber-800">TikTok connected — media requirements may apply.</p>}
                {selectedChannel?.service === 'youtube' && <p className="text-xs text-amber-800">YouTube requires video media. Image-only Studio drafts cannot be sent to this channel.</p>}
                {selectedChannel && !['pinterest', 'tiktok', 'youtube'].includes(selectedChannel.service) && <p className="text-xs text-amber-800">Review this channel’s media and posting requirements in Buffer before handoff.</p>}
                <div className="space-y-2 rounded-lg border bg-stone-50 p-3 text-sm"><p className="font-medium">Schedule only after review</p><label className="flex items-center gap-2"><input type="radio" name="schedule-choice" checked={scheduleChoice === 'time'} onChange={() => { setScheduleChoice('time'); setConfirmed(false); }} />Choose a date and time</label>{scheduleChoice === 'time' && <Input type="datetime-local" value={scheduleAt} onChange={event => { setScheduleAt(event.target.value); setConfirmed(false); }} />}<label className="flex items-center gap-2"><input type="radio" name="schedule-choice" checked={scheduleChoice === 'queue'} onChange={() => { setScheduleChoice('queue'); setConfirmed(false); }} />Use next available Buffer queue slot</label></div>
                <label className="flex items-start gap-2 text-xs text-foreground"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!requiredFieldsComplete || Boolean(busy)} className="mt-0.5" />I reviewed this draft, channel, media requirements, and Buffer handoff.</label>
                <div className="grid gap-2 sm:grid-cols-2"><Button variant="outline" className="gap-2" onClick={() => send('draft')} disabled={!requiredFieldsComplete || !confirmed || Boolean(busy)}><Send className="h-4 w-4" />Send to Buffer Drafts</Button><Button className="gap-2" onClick={() => send('schedule')} disabled={!requiredFieldsComplete || !confirmed || !scheduleReady || Boolean(busy)}><CalendarClock className="h-4 w-4" />Schedule in Buffer</Button></div>
                {post?.buffer_post_id && <p className="text-xs text-muted-foreground">Buffer post ID: {post.buffer_post_id}</p>}
                {post?.buffer_post_id && <Button variant="ghost" size="sm" onClick={refreshBufferPost} disabled={Boolean(busy)}>Refresh Buffer status</Button>}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-stone-200 shadow-sm">
          <CardHeader><CardTitle className="text-lg">Post history</CardTitle><p className="text-sm text-muted-foreground">HC Apparel Draft = saved here only · Buffer Draft = unpublished in Buffer · Scheduled = queued in Buffer · Published = confirmed by Buffer status refresh.</p></CardHeader>
          <CardContent>{posts.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{posts.map(item => (
            <div key={item.id} className="min-w-0 rounded-xl border bg-white p-3">
              <button type="button" onClick={() => choosePost(item)} className="flex w-full min-w-0 gap-3 text-left hover:text-primary">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">{item.image_url && <img src={displayImage(item.image_url)} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.product_name || item.brand} · {item.content_type}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.caption}</p><p className="mt-2 text-xs font-medium text-primary">{item.platform.toUpperCase()} · {item.status === 'draft' ? 'HC Apparel Draft' : item.status === 'sent_to_buffer' ? 'Buffer Draft' : statusLabel[item.status] || item.status}</p><p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p></div>
              </button>
              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                <Button size="sm" variant="outline" onClick={() => choosePost(item)}>View/Edit</Button>
                {item.status === 'draft' && <>
                  <Button size="sm" variant="outline" onClick={() => duplicateDraft(item)} disabled={Boolean(busy)}>Duplicate</Button>
                  <Button size="sm" variant="outline" className="text-red-700" onClick={() => deleteDraft(item)} disabled={Boolean(busy)}>Delete Draft</Button>
                  <Button size="sm" variant="outline" onClick={() => send('draft')} disabled={item.id !== post?.id || !requiredFieldsComplete || !confirmed || Boolean(busy)}>Send to Buffer Drafts</Button>
                  <Button size="sm" variant="outline" onClick={() => send('schedule')} disabled={item.id !== post?.id || !requiredFieldsComplete || !confirmed || !scheduleReady || Boolean(busy)}>Schedule in Buffer</Button>
                </>}
              </div>
            </div>
          ))}</div> : <p className="py-6 text-center text-sm text-muted-foreground">No posts yet. Generate the first campaign above.</p>}</CardContent>
        </Card>
      </main>
    </div>
  );
}
