import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CarFront, Download, RefreshCw, Upload, WalletCards } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';

const eastern = value => value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(value)) : '—';
const miles = value => `${Number(value || 0).toFixed(1)} mi`;
const quote = value => `"${String(value ?? '').replaceAll('"','""')}"`;
const classifications = ['business', 'personal', 'commuting', 'needs_review'];

function parseCsv(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim()); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

const findHeader = (headers, candidates) => headers.find(header => candidates.includes(header.toLowerCase())) || '';
const classifiedMiles = (trip, classification) => trip.ops_mileage_segments?.length
  ? trip.ops_mileage_segments.filter(segment => segment.classification === classification).reduce((total, segment) => total + Number(segment.distance_miles || 0), 0)
  : trip.classification === classification ? Number(trip.final_distance_miles || 0) : 0;

async function fingerprint(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export default function AdminMileage() {
  const [data,setData]=useState({trips:[],vehicles:[],businesses:[],memberships:[],setup:[],financialSync:null,reconciliation:[],tinaInvoice:null});
  const [filters,setFilters]=useState({driver:'all',business:'all',vehicle:'all',classification:'all',month:''});
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [importRows,setImportRows]=useState([]),[headers,setHeaders]=useState([]),[importing,setImporting]=useState(false);
  const [defaults,setDefaults]=useState({driver:'',business:'hc-apparel',vehicle:''});
  const [mapping,setMapping]=useState({startedAt:'',endedAt:'',miles:'',driver:'',business:'',vehicle:'',classification:'',purpose:'',notes:''});

  async function load(){
    setLoading(true);setError('');
    const [trips,vehicles,businesses,memberships,setup,financialSync,reconciliation,tinaInvoice]=await Promise.all([
      supabase.from('ops_mileage_trips').select('*,profiles!ops_mileage_trips_driver_user_id_fkey(full_name,email),ops_vehicles(nickname),ops_mileage_segments(sequence_number,started_at,ended_at,distance_miles,classification,purpose)').order('started_at',{ascending:false}).limit(5000),
      supabase.from('ops_vehicles').select('*').order('nickname'),
      supabase.from('ops_businesses').select('*').order('name'),
      supabase.from('ops_business_memberships').select('*,profiles!ops_business_memberships_user_id_fkey(full_name,email,role)'),
      supabase.from('ops_mobile_account_setup_report').select('*'),
      supabase.from('ops_financial_sync_state').select('*').eq('source','stripe').maybeSingle(),
      supabase.from('ops_reconciliation_matches').select('id,relationship,match_status,confidence,financial_transaction_id,ops_financial_transactions(amount_cents,currency,occurred_at,merchant_name,transaction_kind)').eq('shared_record_id','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0').order('created_at',{ascending:false}),
      supabase.from('ops_shared_records').select('id,payload,revision,updated_at').eq('id','invoice-fab32c15-3fa9-44f8-b059-516e02c6a6d0').maybeSingle(),
    ]);
    const failure=[trips,vehicles,businesses,memberships,setup,financialSync,reconciliation,tinaInvoice].find(result=>result.error);
    if(failure)setError(failure.error.message);else {
      const next={trips:trips.data||[],vehicles:vehicles.data||[],businesses:businesses.data||[],memberships:memberships.data||[],setup:setup.data||[],financialSync:financialSync.data||null,reconciliation:reconciliation.data||[],tinaInvoice:tinaInvoice.data||null};
      setData(next);
      setDefaults(current=>({driver:current.driver||next.memberships[0]?.user_id||'',business:current.business||next.businesses[0]?.id||'hc-apparel',vehicle:current.vehicle}));
    }
    setLoading(false);
  }
  useEffect(()=>{load();},[]);

  const rows=useMemo(()=>data.trips.filter(t=>(filters.driver==='all'||t.driver_user_id===filters.driver)&&(filters.business==='all'||t.business_id===filters.business)&&(filters.vehicle==='all'||t.vehicle_id===filters.vehicle)&&(filters.classification==='all'||t.classification===filters.classification)&&(!filters.month||String(t.started_at).slice(0,7)===filters.month)),[data.trips,filters]);
  const reviewed=rows.filter(t=>t.review_status==='reviewed').reduce((total,t)=>total+classifiedMiles(t,'business'),0);
  const personal=rows.reduce((total,t)=>total+classifiedMiles(t,'personal'),0);
  const commuting=rows.reduce((total,t)=>total+classifiedMiles(t,'commuting'),0);
  const needsReview=rows.filter(t=>t.review_status!=='reviewed'||['active','interrupted'].includes(t.status)).length;
  const names=[...new Map(data.memberships.map(m=>[m.user_id,m.profiles?.full_name||m.profiles?.email||m.user_id])).entries()];
  const business=id=>data.businesses.find(x=>x.id===id)?.name||id, vehicle=id=>data.vehicles.find(x=>x.id===id)?.nickname||'Not selected';
  const tinaFinancial=data.tinaInvoice?.payload?.financialReconciliation;
  const reviewMatches=data.reconciliation.filter(item=>item.match_status==='review_needed');

  function exportCsv(){
    const columns=['Trip ID','Driver','Business','Vehicle','Start Eastern','End Eastern','Purpose','Classification','Review','Miles','Source','Gaps','Segments'];
    const body=rows.map(t=>[t.id,t.profiles?.full_name||t.profiles?.email,business(t.business_id),vehicle(t.vehicle_id),eastern(t.started_at),eastern(t.ended_at),t.business_purpose,t.classification,t.review_status,t.final_distance_miles,t.measurement_source,t.tracking_gap_count,(t.ops_mileage_segments||[]).map(segment=>`${segment.classification}: ${segment.distance_miles} mi${segment.purpose?` (${segment.purpose})`:''}`).join(' | ')]);
    const blob=new Blob([[columns,...body].map(record=>record.map(quote).join(',')).join('\r\n')],{type:'text/csv'});
    const anchor=document.createElement('a');anchor.href=URL.createObjectURL(blob);anchor.download=`HC-Mileage-${new Date().toISOString().slice(0,10)}.csv`;anchor.click();setTimeout(()=>URL.revokeObjectURL(anchor.href),0);
  }

  async function openCsv(event) {
    const file=event.target.files?.[0]; if(!file)return;
    setError('');setNotice('');
    const parsed=parseCsv(await file.text());
    if(parsed.length<2){setError('The CSV needs a header row and at least one trip.');return;}
    const nextHeaders=parsed[0].map(value=>value.trim());
    setHeaders(nextHeaders);setImportRows(parsed.slice(1).map(values=>Object.fromEntries(nextHeaders.map((header,index)=>[header,values[index]||'']))));
    setMapping({startedAt:findHeader(nextHeaders,['started_at','start','start time','start date/time']),endedAt:findHeader(nextHeaders,['ended_at','end','end time','end date/time']),miles:findHeader(nextHeaders,['miles','distance','distance_miles']),driver:findHeader(nextHeaders,['driver','driver email','email']),business:findHeader(nextHeaders,['business','business id']),vehicle:findHeader(nextHeaders,['vehicle','vehicle nickname']),classification:findHeader(nextHeaders,['classification','class']),purpose:findHeader(nextHeaders,['purpose','business purpose']),notes:findHeader(nextHeaders,['notes','note'])});
  }

  function resolveMembership(value, businessId) {
    if(!value)return data.memberships.find(item=>item.user_id===defaults.driver&&item.business_id===businessId);
    const normalized=value.trim().toLowerCase();
    return data.memberships.find(item=>item.business_id===businessId&&[item.user_id,item.profiles?.email,item.profiles?.full_name].filter(Boolean).some(candidate=>String(candidate).toLowerCase()===normalized));
  }

  async function importCsv() {
    if(!mapping.startedAt||!mapping.endedAt||!mapping.miles){setError('Map the start, end, and distance columns before importing.');return;}
    setImporting(true);setError('');setNotice('');
    let imported=0,duplicates=0;const failures=[];const seen=new Set(data.trips.map(trip=>trip.import_fingerprint).filter(Boolean));
    for(let index=0;index<importRows.length;index+=1){
      const row=importRows[index];
      try{
        const businessValue=mapping.business?row[mapping.business]:defaults.business;
        const businessRow=data.businesses.find(item=>[item.id,item.name].some(candidate=>String(candidate).toLowerCase()===String(businessValue||defaults.business).trim().toLowerCase()));
        if(!businessRow)throw new Error('business did not match an authorized business');
        const member=resolveMembership(mapping.driver?row[mapping.driver]:'',businessRow.id);
        if(!member)throw new Error('driver did not match an authorized membership');
        const vehicleValue=mapping.vehicle?row[mapping.vehicle]:defaults.vehicle;
        const vehicleRow=vehicleValue?data.vehicles.find(item=>[item.id,item.nickname].some(candidate=>String(candidate).toLowerCase()===String(vehicleValue).trim().toLowerCase())):null;
        if(vehicleValue&&!vehicleRow)throw new Error('vehicle did not match an available vehicle');
        const started=new Date(row[mapping.startedAt]),ended=new Date(row[mapping.endedAt]),distance=Number(row[mapping.miles]);
        if(Number.isNaN(started.getTime())||Number.isNaN(ended.getTime())||ended<started)throw new Error('start/end date is invalid');
        if(!Number.isFinite(distance)||distance<0)throw new Error('distance is invalid');
        const rawClass=mapping.classification?String(row[mapping.classification]).trim().toLowerCase().replaceAll(' ','_'):'needs_review';
        const classification=classifications.includes(rawClass)?rawClass:'needs_review';
        const purpose=mapping.purpose?row[mapping.purpose]:'';
        const key=await fingerprint([member.user_id,businessRow.id,vehicleRow?.id||'',started.toISOString(),ended.toISOString(),distance.toFixed(3),purpose].join('|'));
        if(seen.has(key)){duplicates+=1;continue;}
        const {error:importError}=await supabase.rpc('mobile_import_mileage_trip',{trip_id:crypto.randomUUID(),target_driver:member.user_id,target_business:businessRow.id,target_vehicle:vehicleRow?.id||null,start_time:started.toISOString(),end_time:ended.toISOString(),distance_miles:distance,selected_classification:classification,purpose:purpose||null,trip_notes:mapping.notes?row[mapping.notes]||null:null,source_fingerprint:key});
        if(importError)throw importError;
        seen.add(key);imported+=1;
      }catch(caught){failures.push(`Row ${index+2}: ${caught.message}`);}
    }
    setImporting(false);
    if(failures.length)setError(failures.slice(0,8).join(' · '));
    setNotice(`${imported} trip${imported===1?'':'s'} imported; ${duplicates} duplicate${duplicates===1?'':'s'} skipped.${failures.length?` ${failures.length} row(s) need correction.`:''}`);
    if(imported)await load();
  }

  const mappingFields=[['startedAt','Start date/time *'],['endedAt','End date/time *'],['miles','Distance miles *'],['driver','Driver'],['business','Business'],['vehicle','Vehicle'],['classification','Classification'],['purpose','Purpose'],['notes','Notes']];
  return <div className="min-h-screen bg-muted/30"><header className="bg-primary px-4 py-9 text-primary-foreground"><div className="container mx-auto max-w-7xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Private operations</p><div className="mt-2 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-extrabold">Mileage</h1><p className="mt-1 text-primary-foreground/70">GPS, odometer, manual, and route estimates remain separately identified.</p></div><div className="flex gap-2"><Button variant="outline" className="bg-transparent text-white" onClick={exportCsv}><Download className="mr-2 h-4 w-4"/>CSV</Button><Button variant="outline" className="bg-transparent text-white" onClick={()=>window.print()}><Download className="mr-2 h-4 w-4"/>Print / PDF</Button><Button className="bg-accent text-accent-foreground" onClick={load}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button></div></div></div></header><main className="container mx-auto max-w-7xl space-y-6 px-4 py-7">
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
    {data.setup.some(x=>x.setup_status!=='ready')&&<section className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Mobile account setup</h2><p className="mb-3 text-sm text-muted-foreground">Existing accounts are reused; no shared or duplicate credentials are created.</p>{data.setup.map(item=><div className="flex justify-between border-t py-2 text-sm" key={item.display_name}><strong>{item.display_name}</strong><span>{item.setup_status.replaceAll('_',' ')}</span></div>)}</section>}
    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><WalletCards className="mt-0.5 h-5 w-5 text-primary"/><div><h2 className="font-bold">Private financial reconciliation</h2><p className="text-sm text-muted-foreground">Stripe customer payments and business-card expenses remain separate and are matched without changing historical amounts.</p></div></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${data.financialSync?.status==='synced'?'bg-green-100 text-green-800':data.financialSync?.status==='partial'?'bg-amber-100 text-amber-900':'bg-muted text-muted-foreground'}`}>{(data.financialSync?.status||'not started').replaceAll('_',' ')}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><article className="rounded-xl bg-muted/50 p-4"><small className="font-bold uppercase text-muted-foreground">Tina Dunn revenue</small><strong className="mt-1 block text-xl">${Number(tinaFinancial?.customerPayment?.grossCollected||83.7).toFixed(2)}</strong><span className="text-xs text-muted-foreground">Payment verified; no storefront order was created.</span></article><article className="rounded-xl bg-muted/50 p-4"><small className="font-bold uppercase text-muted-foreground">Stripe fee / net</small><strong className="mt-1 block text-xl">${Number(tinaFinancial?.customerPayment?.processingFee||2.73).toFixed(2)} / ${Number(tinaFinancial?.customerPayment?.netAfterStripe||80.97).toFixed(2)}</strong><span className="text-xs text-muted-foreground">Fee and net proceeds are provider-verified.</span></article><article className="rounded-xl bg-muted/50 p-4"><small className="font-bold uppercase text-muted-foreground">Verified related costs</small><strong className="mt-1 block text-xl">${Number(tinaFinancial?.relatedCosts?.verifiedActualCosts||0).toFixed(2)}</strong><span className="text-xs text-muted-foreground">Blanks, DTF, postage, packaging, and labor remain incomplete until evidence matches.</span></article><article className="rounded-xl bg-muted/50 p-4"><small className="font-bold uppercase text-muted-foreground">Margin</small><strong className="mt-1 block text-xl">{tinaFinancial?.margin?.complete?`$${Number(tinaFinancial.margin.final).toFixed(2)}`:'Incomplete'}</strong><span className="text-xs text-muted-foreground">Known before unverified costs: ${Number(tinaFinancial?.margin?.knownAmountBeforeUnverifiedFulfillmentCosts||80.97).toFixed(2)}</span></article></div>
      {(reviewMatches.length>0||data.financialSync?.status==='partial')&&<div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><div><strong>{reviewMatches.length} card transaction match{reviewMatches.length===1?'':'es'} need review.</strong><p>{data.financialSync?.last_error||'Merchant/date candidates are not treated as confirmed costs without stronger invoice, receipt, or transaction evidence.'}</p>{data.financialSync?.capability_status?.requiredPermission&&<p className="mt-1">Required access: {data.financialSync.capability_status.requiredPermission}</p>}</div></div>}
      <p className="mt-3 text-xs text-muted-foreground">Last attempt: {eastern(data.financialSync?.last_attempt_at)} · Last successful retrieval: {eastern(data.financialSync?.last_success_at)}</p>
    </section>
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[['Reviewed business',reviewed,'Potential business miles; not a tax determination'],['Personal',personal,'Reported separately'],['Commuting',commuting,'Reported separately'],['Needs review',needsReview,'Trip count']].map(([label,value,note])=><article className="rounded-2xl border bg-white p-5 shadow-sm" key={label}><p className="text-xs font-bold uppercase text-muted-foreground">{label}</p><strong className="mt-2 block text-2xl">{label==='Needs review'?value:miles(value)}</strong><small className="text-muted-foreground">{note}</small></article>)}</section>
    <section className="grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"><select className="h-10 rounded-md border px-3" aria-label="Driver" value={filters.driver} onChange={e=>setFilters({...filters,driver:e.target.value})}><option value="all">All permitted drivers</option>{names.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select><select aria-label="Business" className="h-10 rounded-md border px-3" value={filters.business} onChange={e=>setFilters({...filters,business:e.target.value})}><option value="all">All businesses</option>{data.businesses.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select><select aria-label="Vehicle" className="h-10 rounded-md border px-3" value={filters.vehicle} onChange={e=>setFilters({...filters,vehicle:e.target.value})}><option value="all">All vehicles</option>{data.vehicles.map(x=><option value={x.id} key={x.id}>{x.nickname}</option>)}</select><select aria-label="Classification" className="h-10 rounded-md border px-3" value={filters.classification} onChange={e=>setFilters({...filters,classification:e.target.value})}><option value="all">All classifications</option>{classifications.map(value=><option value={value} key={value}>{value.replaceAll('_',' ')}</option>)}</select><input aria-label="Month" className="h-10 rounded-md border px-3" type="month" value={filters.month} onChange={e=>setFilters({...filters,month:e.target.value})}/></section>
    <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Import mileage CSV</h2><p className="text-sm text-muted-foreground">Map columns, preview rows, and import with stable duplicate detection. Date/time values without an offset are interpreted in this browser’s local time.</p></div><label className="inline-flex cursor-pointer items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Upload className="mr-2 h-4 w-4"/>Choose CSV<input className="sr-only" type="file" accept=".csv,text/csv" onChange={openCsv}/></label></div>
      {headers.length?<><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm">Default driver<select className="mt-1 h-10 w-full rounded-md border px-3" value={defaults.driver} onChange={e=>setDefaults({...defaults,driver:e.target.value})}>{names.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label><label className="text-sm">Default business<select className="mt-1 h-10 w-full rounded-md border px-3" value={defaults.business} onChange={e=>setDefaults({...defaults,business:e.target.value})}>{data.businesses.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="text-sm">Default vehicle<select className="mt-1 h-10 w-full rounded-md border px-3" value={defaults.vehicle} onChange={e=>setDefaults({...defaults,vehicle:e.target.value})}><option value="">No vehicle</option>{data.vehicles.map(item=><option value={item.id} key={item.id}>{item.nickname}</option>)}</select></label>{mappingFields.map(([key,label])=><label className="text-sm" key={key}>{label}<select className="mt-1 h-10 w-full rounded-md border px-3" value={mapping[key]} onChange={e=>setMapping({...mapping,[key]:e.target.value})}><option value="">Use default / unmapped</option>{headers.map(header=><option value={header} key={header}>{header}</option>)}</select></label>)}</div><div className="mt-4 overflow-x-auto"><table className="min-w-[720px] text-sm"><thead><tr>{headers.map(header=><th className="border-b p-2 text-left" key={header}>{header}</th>)}</tr></thead><tbody>{importRows.slice(0,5).map((row,index)=><tr key={index}>{headers.map(header=><td className="border-b p-2" key={header}>{row[header]}</td>)}</tr>)}</tbody></table></div><div className="mt-4 flex items-center justify-between gap-3"><small>{importRows.length} row{importRows.length===1?'':'s'} ready for validation</small><Button onClick={importCsv} disabled={importing}>{importing?'Validating and importing…':'Import validated trips'}</Button></div></>:null}
    </section>
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm"><div className="flex items-center gap-3 border-b p-5"><CarFront className="h-5 w-5 text-primary"/><div><h2 className="font-bold">Mileage log</h2><p className="text-xs text-muted-foreground">{rows.length} trip{rows.length===1?'':'s'} · Eastern Time</p></div></div><div className="overflow-x-auto">{loading?<p className="p-6">Loading mileage…</p>:<table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/50 text-left"><tr><th className="p-3">Time</th><th className="p-3">Driver / business</th><th className="p-3">Purpose</th><th className="p-3">Class</th><th className="p-3">Distance</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y">{rows.map(t=><tr key={t.id}><td className="p-3"><strong>{eastern(t.started_at)}</strong><small className="block text-muted-foreground">{eastern(t.ended_at)} · {vehicle(t.vehicle_id)}</small></td><td className="p-3">{t.profiles?.full_name||t.profiles?.email}<small className="block text-muted-foreground">{business(t.business_id)}</small></td><td className="p-3">{t.business_purpose||'Needs purpose'}<small className="block text-muted-foreground">{t.start_location_label||'Start not labeled'} → {t.destination_label||'Destination not labeled'}</small></td><td className="p-3 capitalize">{t.ops_mileage_segments?.length?`${t.ops_mileage_segments.length} documented segments`:t.classification.replaceAll('_',' ')}</td><td className="p-3"><strong>{miles(t.final_distance_miles)}</strong><small className="block text-muted-foreground">{t.measurement_source||'not finalized'}{t.tracking_gap_count?` · ${t.tracking_gap_count} gap(s)`:''}</small></td><td className="p-3 capitalize">{t.status} · {t.review_status.replaceAll('_',' ')}</td></tr>)}</tbody></table>}</div></section>
  </main></div>;
}
