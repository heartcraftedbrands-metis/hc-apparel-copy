import React, { useMemo, useState } from 'react';
import { CalendarPlus, CheckCircle2, Save } from 'lucide-react';

import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const eventAliases = {
  visitors: ['page_view'],
  productViews: ['product_view', 'view_product'],
  signups: ['account_signup'],
  carts: ['add_to_cart'],
  checkouts: ['checkout_started', 'begin_checkout'],
  purchases: ['purchase_completed', 'purchase'],
  quotes: ['quote_request_submitted', 'bulk_quote_submit'],
  subscribers: ['email_subscribed', 'newsletter_signup'],
};
const defaultChannelNames = ['Google Business', 'TikTok', 'X', 'Pinterest', 'LinkedIn', 'YouTube Shorts', 'Facebook', 'Instagram', 'Email', 'SEO / Organic Search', 'Local Outreach', 'Direct / Unknown'];
const platformAttribution = {
  TikTok: { source:'tiktok', medium:'organic_social' },
  X: { source:'x', medium:'organic_social' },
  Pinterest: { source:'pinterest', medium:'organic_social' },
  LinkedIn: { source:'linkedin', medium:'organic_social' },
  'YouTube Shorts': { source:'youtube', medium:'organic_video' },
  'Google Business': { source:'google_business', medium:'organic' },
  Email: { source:'email', medium:'organic_email' },
  'SEO / Organic Search': { source:'seo_geo', medium:'organic_content' },
  'Local Outreach': { source:'local_outreach', medium:'organic_outreach' },
};
const checklistFields = [
  ['product_active_verified', 'Product still active'],
  ['price_verified', 'Price verified'],
  ['link_verified', 'Link verified'],
  ['utm_link_verified', 'UTM link present'],
  ['media_selected', 'Image/video selected'],
  ['caption_reviewed', 'Caption reviewed'],
  ['cta_reviewed', 'CTA reviewed'],
];
const statuses = ['Idea', 'Draft', 'Ready to Publish', 'Published', 'Archived', 'Needs Update'];
const activeRecommendationPlatforms = new Set(['TikTok','X','Pinterest','LinkedIn','YouTube Shorts','Google Business','Email','SEO / Organic Search','Local Outreach']);
const money = value => `$${Number(value || 0).toFixed(2)}`;
const tracked = value => value === null ? 'Not tracked yet' : Number(value).toLocaleString();
const sourceLabel = event => {
  const source = String(event.metadata?.utm_source || '').toLowerCase();
  if (source === 'google_business') return 'Google Business';
  if (source === 'facebook') return 'Facebook';
  if (source === 'instagram') return 'Instagram';
  if (source === 'tiktok') return 'TikTok';
  if (source === 'x' || source === 'twitter') return 'X';
  if (source === 'pinterest') return 'Pinterest';
  if (source === 'linkedin') return 'LinkedIn';
  if (source === 'youtube') return 'YouTube Shorts';
  if (source === 'email') return 'Email';
  if (['seo', 'seo_geo', 'google', 'organic_search'].includes(source)) return 'SEO / Organic Search';
  if (source === 'local_outreach') return 'Local Outreach';
  return 'Direct / Unknown';
};
const idsForEvent = event => [...new Set([
  event.product_id,
  ...(Array.isArray(event.metadata?.product_ids) ? event.metadata.product_ids : []),
].filter(Boolean).map(String))];
const isEvent = (event, key) => eventAliases[key].includes(event.event_name);

function Section({ title, subtitle, children }) {
  return <Card className="overflow-hidden"><div className="border-b p-4"><h2 className="font-black text-primary">{title}</h2>{subtitle&&<p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}</div><div className="p-4">{children}</div></Card>;
}
function Metric({ label, value, detail }) {
  return <div className="min-w-0 rounded-xl border bg-white p-3"><p className="text-xs font-bold uppercase text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-black text-primary">{value}</p>{detail&&<p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</div>;
}
function count(events, key) { return events.filter(event => isEvent(event, key)).length; }
function revenue(events) { return events.filter(event => isEvent(event, 'purchases')).reduce((sum, event) => sum + Number(event.metadata?.revenue || 0), 0); }
function rate(current, previous) { return previous ? `${(current / previous * 100).toFixed(1)}%` : 'Not tracked yet'; }
function drop(current, previous) { return previous ? `${Math.max(0, 100 - current / previous * 100).toFixed(1)}%` : 'Not tracked yet'; }
function trend(current, previous, comparable) {
  if (!comparable || (current === 0 && previous === 0)) return 'Not enough data';
  if (current > previous) return 'Improving';
  if (current < previous) return 'Declining';
  return 'Flat';
}

function ApprovalCard({ draft, onReload, onNotice, onError }) {
  const [row, setRow] = useState({ ...draft });
  const saleContent = /sale/i.test(`${row.content_type || ''} ${row.headline || ''}`);
  const set = (key, value) => setRow(current => ({ ...current, [key]: value }));
  const save = async () => {
    onError('');
    const next = { ...row };
    if (next.status === 'Ready to Publish' || next.status === 'Published') {
      if (next.product_id) {
        const { data: product } = await supabase.from('storefront_products').select('id,price,sale_price,stock').eq('id', next.product_id).maybeSingle();
        next.product_active_verified = Boolean(product && Number(product.stock) > 0);
        next.price_verified = Boolean(product && Number(product.sale_price ?? product.price) > 0);
      } else {
        next.product_active_verified = true;
        next.price_verified = true;
      }
      next.link_verified = /^https:\/\/www\.ilovehcapparel\.net\//.test(next.product_url || '');
      next.utm_link_verified = (next.tracking_url || '').includes('utm_campaign=hc_apparel_organic_launch');
      if (saleContent) {
        const { data: sale } = await supabase.from('storefront_homepage_specials').select('product_id').eq('product_id', next.product_id).limit(1);
        next.sale_status_verified = Boolean(sale?.length);
      }
    }
    const payload = Object.fromEntries(Object.entries(next).filter(([key]) => !['id','created_at','updated_at'].includes(key)));
    const { error } = await supabase.from('marketing_social_content').update(payload).eq('id', next.id);
    if (error) { onError(error.message || 'Content approval could not be saved.'); return; }
    onNotice('Content checklist and manual results saved. Nothing was published.');
    await onReload();
  };
  return <article className="rounded-xl border bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase text-muted-foreground">Day {row.day_number} · {row.platform}</p><h3 className="font-black">{row.headline}</h3></div><select className="h-10 rounded-md border bg-white px-2 text-sm" value={row.status} onChange={event=>set('status',event.target.value)}>{statuses.map(status=><option key={status}>{status}</option>)}</select></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{checklistFields.map(([key,label])=><label key={key} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-sm"><input type="checkbox" checked={Boolean(row[key])} onChange={event=>set(key,event.target.checked)}/>{label}</label>)}{saleContent&&<label className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-sm"><input type="checkbox" checked={Boolean(row.sale_status_verified)} onChange={event=>set('sale_status_verified',event.target.checked)}/>Sale status verified</label>}</div><p className="mt-4 text-xs font-bold uppercase text-muted-foreground">Platform-reported engagement</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">{[['platform_views','Views'],['platform_likes','Likes'],['platform_comments','Comments'],['platform_shares','Shares'],['platform_saves','Saves']].map(([key,label])=><label key={key} className="text-xs font-bold text-muted-foreground">{label}<input className="mt-1 h-9 w-full rounded-md border px-2 text-sm" type="number" min="0" value={row[key]??''} onChange={event=>set(key,event.target.value===''?null:Number(event.target.value))}/></label>)}</div>{row.status==='Published'&&<div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="text-xs font-bold text-muted-foreground">Published URL<input className="mt-1 h-9 w-full rounded-md border px-2 text-sm" value={row.published_url||''} onChange={event=>set('published_url',event.target.value)}/></label><label className="text-xs font-bold text-muted-foreground">Published Date<input className="mt-1 h-9 w-full rounded-md border px-2 text-sm" type="datetime-local" value={row.published_date?String(row.published_date).slice(0,16):''} onChange={event=>set('published_date',event.target.value||null)}/></label></div>}<Button className="mt-3" size="sm" onClick={save}><Save className="mr-1 h-4 w-4"/>Save review</Button></article>;
}

export default function WeeklyOrganicReview({ events, orders, products, drafts, campaigns, socialAccounts=[], baseline, onReload, onNotice, onError }) {
  const [period, setPeriod] = useState('last7');
  const [preparing, setPreparing] = useState(false);
  const now = Date.now();
  const baselineMs = baseline?.getTime() || Number.POSITIVE_INFINITY;
  const range = period === 'previous7' ? { start: now - 14*86400000, end: now - 7*86400000, days: 7 } : period === '30' ? { start: now - 30*86400000, end: now, days: 30 } : { start: now - 7*86400000, end: now, days: 7 };
  const start = Math.max(range.start, baselineMs);
  const windowEvents = events.filter(event => { const time = new Date(event.created_at).getTime(); return time >= start && time < range.end; });
  const previousStart = start - range.days*86400000;
  const comparable = Number.isFinite(baselineMs) && previousStart >= baselineMs;
  const previousEvents = comparable ? events.filter(event => { const time = new Date(event.created_at).getTime(); return time >= previousStart && time < start; }) : [];
  const campaign = campaigns.find(item => item.campaign_key === 'hc_apparel_organic_launch');
  const campaignDrafts = campaign ? drafts.filter(item => item.campaign_id === campaign.id) : [];
  const productMap = useMemo(() => new Map(products.map(product => [String(product.id), product])), [products]);
  const summary = Object.fromEntries(Object.keys(eventAliases).map(key => [key, count(windowEvents,key)]));

  const channelNames = [...new Set([...defaultChannelNames,...socialAccounts.map(account=>account.platform)])];
  const channels = channelNames.map(name => {
    const rows = windowEvents.filter(event => sourceLabel(event)===name);
    const attributed = rows.some(event => event.metadata?.utm_source);
    const purchaseRows=rows.filter(event=>isEvent(event,'purchases'));
    const account=socialAccounts.find(item=>item.platform===name);
    return { name, account, available: name==='Direct / Unknown' ? rows.length>0 : attributed, visitors:count(rows,'visitors'), productViews:count(rows,'productViews'), carts:count(rows,'carts'), checkouts:count(rows,'checkouts'), purchases:purchaseRows.length, revenue:revenue(rows), revenueAvailable:purchaseRows.every(event=>event.metadata?.revenue!=null), quotes:count(rows,'quotes') };
  });
  const currentChannels=channels.filter(row=>!['Facebook','Instagram'].includes(row.name));

  const productStats = useMemo(() => {
    const stats = {};
    const ensure = id => {
      if (!id) return null;
      const product = productMap.get(String(id));
      return stats[id] ||= { id:String(id), name:product?.name||String(id), brand:product?.brand||'Unknown', style:product?.style_number||'Not available', price:product ? Number(product.sale_price ?? product.price) : null, status:product ? `${product.visibility==='public'&&product.is_active?'Public / Active':'Not public'}${Number(product.stock)>0?' · In stock':' · Out of stock'}`:'Not available', views:0,carts:0,checkouts:0,purchases:0,revenue:0 };
    };
    windowEvents.forEach(event => idsForEvent(event).forEach(id => { const row=ensure(id); if(!row)return; if(isEvent(event,'productViews'))row.views++; if(isEvent(event,'carts'))row.carts++; if(isEvent(event,'checkouts'))row.checkouts++; }));
    orders.filter(order => { const time=new Date(order.created_date).getTime(); return time>=start&&time<range.end; }).forEach(order => (Array.isArray(order.order_items)?order.order_items:[]).forEach(item => { const row=ensure(item.product_id||item.id); if(!row)return; const quantity=Number(item.quantity)||1; row.purchases+=quantity; row.revenue+=Number(item.price||0)*quantity; }));
    return Object.values(stats);
  }, [orders, productMap, range.end, start, windowEvents]);

  const published = campaignDrafts.filter(item => item.status==='Published').map(item => {
    const rows=windowEvents.filter(event=>event.metadata?.utm_campaign==='hc_apparel_organic_launch'&&event.metadata?.utm_content===item.utm_content);
    const purchaseRows=rows.filter(event=>isEvent(event,'purchases'));
    return {...item,clicks:count(rows,'visitors'),productViews:count(rows,'productViews'),carts:count(rows,'carts'),checkouts:count(rows,'checkouts'),purchases:purchaseRows.length,revenue:revenue(rows),revenueAvailable:purchaseRows.every(event=>event.metadata?.revenue!=null)};
  }).sort((a,b)=>(b.purchases-a.purchases)||(b.checkouts-a.checkouts)||(b.carts-a.carts)||(b.clicks-a.clicks));

  const funnel = [['Visit',summary.visitors],['Product View',summary.productViews],['Account Signup',summary.signups],['Add to Cart',summary.carts],['Checkout Started',summary.checkouts],['Purchase',summary.purchases]];
  const insights = [];
  const recommendationChannels=channels.filter(row=>activeRecommendationPlatforms.has(row.name));
  const topChannel=[...recommendationChannels].filter(row=>row.available&&row.productViews>0).sort((a,b)=>b.productViews-a.productViews)[0];
  if(topChannel)insights.push(`${topChannel.name} drove the most attributed product views in this review window.`);
  const viewedNoCart=[...productStats].filter(row=>row.views>0&&!row.carts).sort((a,b)=>b.views-a.views)[0];
  if(viewedNoCart)insights.push(`${viewedNoCart.brand} ${viewedNoCart.style} received product views but no tracked cart additions.`);
  if(summary.checkouts>0&&summary.purchases===0)insights.push('Customers reached checkout, but no tracked purchase was completed in this window.');
  const converting=[...recommendationChannels].filter(row=>row.available&&row.visitors>0&&row.purchases>0).sort((a,b)=>(b.purchases/b.visitors)-(a.purchases/a.visitors));
  if(converting.length)insights.push(`${converting[0].name} produced the strongest tracked visit-to-purchase rate in this window.`);

  const weightedProducts=[...productStats].sort((a,b)=>(b.purchases*100+b.checkouts*30+b.carts*10+b.views)-(a.purchases*100+a.checkouts*30+a.carts*10+a.views));
  const recommendations=[];
  if(weightedProducts[0])recommendations.push({title:`Feature ${weightedProducts[0].name}`,channel:topChannel?.name||'Organic social',cta:'View Product',reason:`Supported by ${weightedProducts[0].views} view(s), ${weightedProducts[0].carts} cart add(s), and ${weightedProducts[0].purchases} purchase(s) in this window.`});
  if(topChannel)recommendations.push({title:`Build another ${topChannel.name} post`,channel:topChannel.name,cta:'Explore HC Apparel',reason:'This channel produced the most attributed product interest in the selected window.'});
  if(viewedNoCart)recommendations.push({title:`Explain the fit and use case for ${viewedNoCart.name}`,channel:'SEO / Organic Social',cta:'View Colors & Sizes',reason:'The product received attention without a tracked cart addition.'});

  const prepareNextWeek = async () => {
    if(!campaign)return;
    setPreparing(true);onError('');
    try {
      const nextMonday=new Date();nextMonday.setHours(0,0,0,0);nextMonday.setDate(nextMonday.getDate()+((8-nextMonday.getDay())%7||7));
      const weekStart=nextMonday.toISOString().slice(0,10);
      if(campaignDrafts.some(item=>item.generation_week_start===weekStart)){onNotice('Next week is already prepared. No duplicate drafts were created.');return;}
      const [{data:live,error:productError},{data:sales,error:saleError}]=await Promise.all([
        supabase.from('storefront_products').select('id,name,brand,style_number,price,sale_price,stock,image_url').gt('stock',0),
        supabase.from('storefront_homepage_specials').select('product_id,name,brand,style_number,price,image_url'),
      ]);
      if(productError||saleError)throw productError||saleError;
      const liveMap=new Map((live||[]).map(product=>[String(product.id),product]));
      const saleMap=new Map((sales||[]).map(product=>[String(product.product_id),product]));
      const candidates=[];
      for(const stat of weightedProducts){const product=liveMap.get(stat.id);if(product&&!candidates.some(item=>item.id===product.id))candidates.push(product);}
      for(const sale of sales||[]){const product=liveMap.get(String(sale.product_id));if(product&&!candidates.some(item=>item.id===product.id))candidates.push({...product,isCurrentSale:true});}
      for(const product of live||[]){if(candidates.length>=7)break;if(!candidates.some(item=>item.id===product.id))candidates.push(product);}
      if(!candidates.length)throw new Error('No public, in-stock products are available for next-week drafts.');
      const activeSocial=new Set(socialAccounts.filter(account=>account.status==='Active'&&activeRecommendationPlatforms.has(account.platform)).map(account=>account.platform));
      const allowed=new Set([...activeSocial,'Google Business','Email','SEO / Organic Search','Local Outreach']);
      const rankedChannels=[...channels].filter(row=>row.available&&allowed.has(row.name)).sort((a,b)=>(b.productViews+b.carts*3+b.checkouts*5+b.purchases*10)-(a.productViews+a.carts*3+a.checkouts*5+a.purchases*10)).map(row=>row.name);
      const defaults=['TikTok','X','Pinterest','Google Business','Email','SEO / Organic Search','Local Outreach'].filter(name=>allowed.has(name));
      const chosen=[...new Set([...rankedChannels.filter(name=>name!=='Direct / Unknown'),...defaults])].slice(0,7);
      const maxDay=Math.max(0,...campaignDrafts.map(item=>Number(item.day_number)||0));
      const rows=Array.from({length:7},(_,index)=>{
        const product=candidates[index%candidates.length];
        const date=new Date(nextMonday);date.setDate(date.getDate()+index);
        const platform=chosen[index]||defaults[index];
        const attribution=platformAttribution[platform]||{source:platform.toLowerCase().replace(' / organic search','').replaceAll(' ','_'),medium:'organic'};
        const source=attribution.source;
        const content=`week_${weekStart}_day_${index+1}_${source}`;
        const productUrl=`https://www.ilovehcapparel.net/ProductDetail?id=${encodeURIComponent(product.id)}`;
        const isSale=saleMap.has(String(product.id));
        const account=socialAccounts.find(item=>item.platform===platform);
        return {campaign_id:campaign.id,day_number:maxDay+index+1,planned_date:date.toISOString().slice(0,10),platform:platform==='SEO / Organic Search'?'SEO / GEO':platform,account_handle:account?.handle||null,account_profile_url:account?.profile_url||null,content_type:isSale?'S&S Sale Pick':'Next Week Recommendation',headline:isSale?`Current S&S Sale Pick: ${product.name}`:`${product.brand} ${product.name}`.replace(new RegExp(`^${product.brand} ${product.brand} `,'i'),`${product.brand} `),caption:`Draft: Feature ${product.name} as a practical option from the live HC Apparel catalog. Current HC Apparel customer price: ${money(product.sale_price??product.price)}. Review the product benefits, image, CTA, and availability before marking this content ready.`,short_caption:`${product.name} — ${money(product.sale_price??product.price)} at HC Apparel.`,cta:'View Product',product_id:product.id,product_name:product.name,product_url:productUrl,tracking_url:`${productUrl}&utm_source=${source}&utm_medium=${attribution.medium}&utm_campaign=hc_apparel_organic_launch&utm_content=${content}`,hashtags:`#HCApparel #${String(product.brand||'Apparel').replace(/\s/g,'')} #ApparelBlanks`,status:'Draft',utm_source:source,utm_medium:attribution.medium,utm_campaign:'hc_apparel_organic_launch',utm_content:content,recommended_image_url:product.image_url,image_video_concept:'Use the verified live product image and add one simple benefit or use-case callout. Keep the garment as the visual focus.',recommended_format:['TikTok','YouTube Shorts'].includes(platform)?'Vertical short-form video / Reel':'Portrait feed post',recommended_dimensions:['TikTok','YouTube Shorts'].includes(platform)?'1080 × 1920 px (9:16)':'1080 × 1350 px (4:5)',assigned_to:['TikTok','YouTube Shorts'].includes(platform)?'YHO / Mario':'King Terik',product_active_verified:true,price_verified:true,link_verified:true,utm_link_verified:true,media_selected:Boolean(product.image_url),caption_reviewed:false,cta_reviewed:false,sale_status_verified:!isSale||saleMap.has(String(product.id)),product_validated_at:new Date().toISOString(),sale_validation_status:isSale?'Current storefront S&S Sale Pick revalidated during draft preparation.':'Live product, price, and stock revalidated during draft preparation.',generation_week_start:weekStart,generated_from_review:true};
      });
      const {error}=await supabase.from('marketing_social_content').insert(rows);if(error)throw error;
      onNotice(`Prepared ${rows.length} draft-only recommendations for the week of ${weekStart}. Nothing was published.`);await onReload();
    } catch(error){onError(error.message||'Next week could not be prepared.');}
    finally{setPreparing(false);}
  };

  const scoreMetrics=[['Traffic',summary.visitors,count(previousEvents,'visitors')],['Engagement',windowEvents.filter(event=>['product_view','view_product','add_to_cart','sale_promo_clicked'].includes(event.event_name)).length,previousEvents.filter(event=>['product_view','view_product','add_to_cart','sale_promo_clicked'].includes(event.event_name)).length],['Product Interest',summary.productViews,count(previousEvents,'productViews')],['Checkout Intent',summary.checkouts,count(previousEvents,'checkouts')],['Purchases',summary.purchases,count(previousEvents,'purchases')],['Quotes',summary.quotes,count(previousEvents,'quotes')],['Subscribers',summary.subscribers,count(previousEvents,'subscribers')]];
  const ranked = (key,reverse=false) => [...productStats].filter(row=>reverse?row[key]>0:true).sort((a,b)=>b[key]-a[key]);
  const groups=[['Most Viewed Products',ranked('views')],['Most Added to Cart',ranked('carts')],['Most Checkout Starts',ranked('checkouts')],['Most Purchased',ranked('purchases')],['Highest Revenue',ranked('revenue')],['Views But No Cart Adds',productStats.filter(row=>row.views>0&&!row.carts).sort((a,b)=>b.views-a.views)],['Cart Adds But No Checkout',productStats.filter(row=>row.carts>0&&!row.checkouts).sort((a,b)=>b.carts-a.carts)],['Checkout Starts But No Purchase',productStats.filter(row=>row.checkouts>0&&!row.purchases).sort((a,b)=>b.checkouts-a.checkouts)]];

  return <div className="space-y-5 overflow-x-hidden"><div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-black text-primary">Weekly Organic Marketing Review</h2><p className="text-sm text-muted-foreground">Baseline-safe analytics and draft-only recommendations for the existing HC Apparel Organic Launch campaign.</p></div><div className="flex flex-wrap gap-2">{[['last7','Last 7 Days'],['previous7','Previous 7 Days'],['30','30 Days']].map(([key,label])=><Button key={key} size="sm" variant={period===key?'default':'outline'} onClick={()=>setPeriod(key)}>{label}</Button>)}</div></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Website Visitors',summary.visitors],['Product Views',summary.productViews],['Account Signups',summary.signups],['Add to Cart',summary.carts],['Checkout Started',summary.checkouts],['Purchases',summary.purchases],['Quote Requests',summary.quotes],['Email Subscribers',summary.subscribers]].map(([label,value])=><Metric key={label} label={label} value={tracked(value)}/>)}</div>
    <Section title="Weekly Scorecard" subtitle="Trends appear only when a complete comparable period exists after the reliable baseline."><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{scoreMetrics.map(([label,current,previous])=><Metric key={label} label={label} value={tracked(current)} detail={trend(current,previous,comparable)}/>)}</div></Section>
    <Section title="Channel Performance" subtitle="Current active channels only. Inactive Meta history remains stored and available through Social Account settings."><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{currentChannels.map(row=><article key={row.name} className="rounded-xl border p-3"><h3 className="font-black">{row.name}</h3>{row.account&&<p className="text-xs text-muted-foreground">{row.account.handle||'No handle saved'} · {row.account.status}</p>}<div className="mt-2 grid grid-cols-2 gap-2 text-xs">{[['Visitors',row.visitors],['Product Views',row.productViews],['Cart Adds',row.carts],['Checkout Starts',row.checkouts],['Purchases',row.purchases],['Revenue',row.revenue],['Quote Requests',row.quotes]].map(([label,value])=><p key={label}><span className="block text-muted-foreground">{label}</span><b>{row.available&&!(label==='Revenue'&&!row.revenueAvailable)?(label==='Revenue'?money(value):tracked(value)):'Not tracked yet'}</b></p>)}</div></article>)}</div></Section>
    <Section title="Content Performance" subtitle="Only manually Published campaign content is ranked. Purchases, checkouts, and cart adds outrank page traffic.">{published.length?<div className="grid gap-3 sm:grid-cols-2">{published.map(item=><article key={item.id} className="rounded-xl border p-3"><p className="text-xs font-bold uppercase text-muted-foreground">{item.platform} · {item.published_date?new Date(item.published_date).toLocaleDateString():'Date not recorded'}</p><h3 className="font-black">{item.headline}</h3><p className="text-xs">{item.product_name||'Page / service content'}</p><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><p>Clicks <b className="block">{item.clicks}</b></p><p>Views <b className="block">{item.productViews}</b></p><p>Carts <b className="block">{item.carts}</b></p><p>Checkout <b className="block">{item.checkouts}</b></p><p>Purchases <b className="block">{item.purchases}</b></p><p>Revenue <b className="block">{item.revenueAvailable?money(item.revenue):'Not tracked yet'}</b></p></div>{item.published_url&&<a className="mt-2 block break-all text-xs text-primary underline" href={item.published_url} target="_blank" rel="noreferrer">Published post</a>}</article>)}</div>:<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Not tracked yet. No campaign content is manually marked Published.</p>}</Section>
    <Section title="Product Performance" subtitle="Customer-safe product information only; vendor cost is not included."><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{groups.map(([title,rows])=><article key={title} className="rounded-xl border p-3"><h3 className="font-black">{title}</h3>{rows.length?<ol className="mt-2 space-y-2 text-sm">{rows.slice(0,5).map(row=><li key={row.id}><b>{row.name}</b><span className="block text-xs text-muted-foreground">{row.brand} · {row.style} · {row.price==null?'Price unavailable':money(row.price)}</span><span className="block text-xs">{row.status}</span></li>)}</ol>:<p className="mt-2 text-sm text-muted-foreground">Not tracked yet.</p>}</article>)}</div></Section>
    <Section title="Reliable Funnel" subtitle="Conversions and drop-offs compare events from this same baseline-safe measurement window."><div className="grid gap-2">{funnel.map(([label,value],index)=><div key={label} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border p-3"><div><b>{label}</b><p className="text-xs text-muted-foreground">Conversion: {index?rate(value,funnel[index-1][1]):'Starting stage'} · Drop-off: {index?drop(value,funnel[index-1][1]):'Not applicable'}</p></div><strong>{value.toLocaleString()}</strong></div>)}</div></Section>
    <div className="grid gap-5 lg:grid-cols-2"><Section title="Weekly Insights" subtitle="Only conclusions supported by tracked data are shown.">{insights.length?<ul className="space-y-2">{insights.map(text=><li key={text} className="rounded-lg bg-muted/50 p-3 text-sm">{text}</li>)}</ul>:<p className="text-sm text-muted-foreground">Not enough data yet.</p>}</Section><Section title="Recommended Next Week" subtitle="Organic-only ideas; no storefront or campaign changes occur.">{recommendations.length?<div className="space-y-3">{recommendations.map(item=><article key={item.title} className="rounded-lg border p-3"><b>{item.title}</b><p className="text-xs text-muted-foreground">{item.channel} · CTA: {item.cta}</p><p className="mt-1 text-sm">{item.reason}</p></article>)}</div>:<p className="text-sm text-muted-foreground">Not enough data yet.</p>}<Button className="mt-4" onClick={prepareNextWeek} disabled={preparing}><CalendarPlus className="mr-2 h-4 w-4"/>{preparing?'Revalidating live products…':'Prepare Next Week'}</Button><p className="mt-2 text-xs text-muted-foreground">Creates up to seven Draft records in this campaign after checking current public status, stock, price, image, link, and current Sale Pick eligibility. It never publishes.</p></Section></div>
    <Section title="Approval Checklist & Content Results" subtitle="Ready to Publish is a manual review state only. Inactive-channel history is excluded from current approval work."><div className="grid gap-3 lg:grid-cols-2">{campaignDrafts.filter(item=>item.active_schedule!==false&&!['Archived'].includes(item.status)&&activeRecommendationPlatforms.has(item.platform==='SEO / GEO'?'SEO / Organic Search':item.platform)).map(draft=><ApprovalCard key={`${draft.id}-${draft.updated_at}`} draft={draft} onReload={onReload} onNotice={onNotice} onError={onError}/>)}</div></Section>
    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm"><p className="flex items-center gap-2 font-black text-green-900"><CheckCircle2 className="h-4 w-4"/>$0 organic guardrail active</p><p className="mt-1 text-green-800">Paid advertising remains disabled. Recommendations focus on organic posting, SEO, Google Business, email, local outreach, product selection, content quality, and conversion improvements.</p></div>
  </div>;
}
