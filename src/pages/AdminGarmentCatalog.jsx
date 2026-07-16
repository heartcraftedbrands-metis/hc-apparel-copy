import React, { useState, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Upload, Plus, CheckCircle2, AlertCircle, TriangleAlert,
  RefreshCw, Package, ShoppingBag, Truck, BarChart3, Edit2, Check, X
} from 'lucide-react';
import BuildDraftProducts from '@/components/catalog/BuildDraftProducts';
import DraftProductQA from '@/components/catalog/DraftProductQA';
import PublishTestProduct from '@/components/catalog/PublishTestProduct';
import RepairProductImages from '@/components/catalog/RepairProductImages';

const MATERIALS = [
  '100% Cotton', 'Organic Cotton', 'Ring-Spun Cotton', 'Cotton Blend',
  'CVC Cotton Blend', 'Linen', 'Wool', 'Bamboo', 'Bamboo Blend',
  'Sports / Activewear', 'Other',
];

const PRODUCT_TYPES = [
  'T-Shirt', 'Hoodie', 'Sweatshirt', 'Tank Top', 'Polo',
  'Shorts', 'Joggers', 'Youth', 'Sportswear', 'Other',
];

const STATUSES = [
  { value: 'approved_to_sell', label: 'Approved to Sell', color: 'bg-green-100 text-green-800' },
  { value: 'maybe_later', label: 'Maybe Later', color: 'bg-blue-100 text-blue-800' },
  { value: 'not_selling', label: 'Not Selling', color: 'bg-red-100 text-red-800' },
];

function statusBadge(status) {
  const s = STATUSES.find(x => x.value === status) || STATUSES[0];
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>{s.label}</span>;
}

function invBadge(qty) {
  const n = Number(qty) || 0;
  if (n > 0) return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">In Stock ({n})</span>;
  return <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Out of Stock</span>;
}

const EMPTY_FORM = {
  brand: '', style_number: '', product_name: '', material: '',
  product_type: '', color: '', size: '', sku: '',
  blank_cost: '', customer_price: '', inventory_qty: '',
  image_url: '', status: 'approved_to_sell',
};

// ── Section 1: Add Single Garment ──────────────────────────────────────────
function AddGarmentSection({ onAdded }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      // Auto-calculate customer price when blank_cost changes and customer_price not manually set
      if (k === 'blank_cost' && f.customer_price === '') {
        // leave blank — user can see placeholder
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.sku.trim()) { toast.error('SKU is required'); return; }
    if (!form.product_name.trim()) { toast.error('Product Name is required'); return; }
    setSaving(true);
    try {
      const blankCost = parseFloat(form.blank_cost) || 0;
      const customerPrice = form.customer_price !== ''
        ? parseFloat(form.customer_price) || parseFloat((blankCost + 2).toFixed(2))
        : parseFloat((blankCost + 2).toFixed(2));
      await base44.entities.GarmentCatalog.create({
        brand: form.brand,
        style_number: form.style_number,
        product_name: form.product_name,
        material: form.material,
        product_type: form.product_type,
        color: form.color,
        size: form.size,
        sku: form.sku,
        blank_cost: blankCost,
        customer_price: customerPrice,
        inventory_qty: parseInt(form.inventory_qty) || 0,
        image_url: form.image_url,
        status: form.status,
      });
      toast.success('Garment added!');
      setForm(EMPTY_FORM);
      onAdded();
    } catch (err) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const blankCost = parseFloat(form.blank_cost) || 0;
  const pricePlaceholder = `$${(blankCost + 2).toFixed(2)} (auto)`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="w-7 h-7 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center font-bold">1</span>
          Add Single Garment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Brand</label>
              <Input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="e.g. Bella + Canvas" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Style Number</label>
              <Input value={form.style_number} onChange={e => set('style_number', e.target.value)} placeholder="e.g. BC3001" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Product Name *</label>
              <Input value={form.product_name} onChange={e => set('product_name', e.target.value)} placeholder="e.g. Unisex Jersey Tee" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Material</label>
              <select value={form.material} onChange={e => set('material', e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                <option value="">— Select Material —</option>
                {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Product Type</label>
              <select value={form.product_type} onChange={e => set('product_type', e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                <option value="">— Select Type —</option>
                {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Color</label>
              <Input value={form.color} onChange={e => set('color', e.target.value)} placeholder="e.g. White" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Size</label>
              <Input value={form.size} onChange={e => set('size', e.target.value)} placeholder="e.g. S, M, L, XL" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">SKU *</label>
              <Input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="e.g. BC3001-WHT-S" required />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Blank Cost ($)</label>
              <Input type="number" step="0.01" min="0" value={form.blank_cost}
                onChange={e => set('blank_cost', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Customer Price ($)</label>
              <Input type="number" step="0.01" min="0" value={form.customer_price}
                onChange={e => set('customer_price', e.target.value)} placeholder={pricePlaceholder} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Inventory</label>
              <Input type="number" min="0" value={form.inventory_qty}
                onChange={e => set('inventory_qty', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Image URL</label>
              <Input value={form.image_url} onChange={e => set('image_url', e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-white">
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" disabled={saving} className="gap-2">
              {saving
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                : <><Plus className="w-4 h-4" />Add Garment</>}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setForm(EMPTY_FORM)}>Clear</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Section 2: CSV Upload ──────────────────────────────────────────────────
function UploadCSVSection({ onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) { toast.error('CSV files only'); return; }
    setFile(f); setPreview(null); setReport(null);
  };

  const handleValidate = async () => {
    if (!file) { toast.error('Select a CSV file first'); return; }
    setLoading(true);
    try {
      const text = await file.text();
      const res = await base44.functions.invoke('importGarmentCSV', { csv_content: text, file_name: file.name, preview_only: true });
      if (!res.data.success) { toast.error(res.data.error || 'Validation failed'); return; }
      setPreview(res.data);
      toast.success(`Validated — ${res.data.valid_rows} rows ready`);
    } catch (err) {
      toast.error('Validation error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !preview) return;
    if (!confirm(`Import ${preview.valid_rows} garments from "${file.name}"? Append/update only — nothing deleted, nothing published.`)) return;
    setImporting(true);
    try {
      const text = await file.text();
      const res = await base44.functions.invoke('importGarmentCSV', { csv_content: text, file_name: file.name, preview_only: false });
      const data = res.data;
      if (!data.success) { toast.error(data.error || 'Import failed'); setReport(data); return; }
      setReport(data);
      setPreview(null);
      onImported();
      toast.success(`Done — ${data.new_garments_added} added, ${data.existing_garments_updated} updated`);
    } catch (err) {
      toast.error('Import error: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => { setFile(null); setPreview(null); setReport(null); if (inputRef.current) inputRef.current.value = ''; };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="w-7 h-7 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center font-bold">2</span>
          Upload Clean Starter CSV
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Required columns helper */}
        <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground mb-1">Required columns (flexible names accepted):</p>
          <p>Brand · Style Number · Product Name · Material · Product Type · Color · Size · SKU · Blank Cost · Customer Price · Inventory · Image URL · Status</p>
          <p className="mt-1 text-green-700 font-medium">✓ Append/update by SKU · Never deletes · Never publishes · Max 500 rows</p>
        </div>

        {!report && (
          <>
            <label className="block cursor-pointer">
              <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${file ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/30'}`}>
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                {file
                  ? <div><p className="font-semibold text-primary">{file.name}</p><p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p></div>
                  : <div><p className="text-sm font-medium text-muted-foreground">Click to select CSV file</p><p className="text-xs text-muted-foreground mt-1">Max 500 rows per file</p></div>}
              </div>
              <input ref={inputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            </label>

            <div className="flex gap-2">
              <Button onClick={handleValidate} disabled={!file || loading || importing} className="flex-1 bg-accent hover:bg-accent/90 gap-2">
                {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Validating…</> : <>Validate & Preview</>}
              </Button>
              {file && <Button variant="outline" onClick={reset} disabled={loading || importing}>Reset</Button>}
            </div>
          </>
        )}

        {/* Preview */}
        {preview && !report && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Rows in file', value: preview.total_rows_in_file },
                { label: 'Valid rows', value: preview.valid_rows, green: true },
                { label: 'Skipped', value: preview.skipped_rows, warn: preview.skipped_rows > 0 },
              ].map(s => (
                <div key={s.label} className="bg-muted/50 rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className={`text-lg font-bold ${s.green ? 'text-green-700' : s.warn && s.value > 0 ? 'text-amber-700' : ''}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {preview.skipped_detail?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1 flex items-center gap-1"><TriangleAlert className="w-3.5 h-3.5" />Skipped rows</p>
                {preview.skipped_detail.slice(0, 10).map((s, i) => (
                  <p key={i} className="text-xs text-amber-900">Row {s.row}{s.sku ? ` (${s.sku})` : ''}: {s.reason}</p>
                ))}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>{['Brand','Style#','Product Name','Material','Color','Size','SKU','Cost','Price','Inv','Status'].map(h =>
                    <th key={h} className="text-left px-2 py-1.5 text-muted-foreground font-medium whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.preview?.map((r, i) => (
                    <tr key={i} className="border-t hover:bg-muted/30">
                      <td className="px-2 py-1">{r.brand}</td>
                      <td className="px-2 py-1 font-mono">{r.style_number}</td>
                      <td className="px-2 py-1 max-w-32 truncate" title={r.product_name}>{r.product_name}</td>
                      <td className="px-2 py-1">{r.material}</td>
                      <td className="px-2 py-1">{r.color}</td>
                      <td className="px-2 py-1">{r.size}</td>
                      <td className="px-2 py-1 font-mono">{r.sku}</td>
                      <td className="px-2 py-1">${r.blank_cost?.toFixed(2)}</td>
                      <td className="px-2 py-1 font-semibold text-green-700">${r.customer_price?.toFixed(2)}</td>
                      <td className="px-2 py-1">{r.inventory_qty}</td>
                      <td className="px-2 py-1">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={importing || preview.valid_rows === 0} className="flex-1 gap-2 h-11">
                {importing ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Importing…</> : <><Upload className="w-4 h-4" />Import {preview.valid_rows} Garments — Append Only</>}
              </Button>
              <Button variant="outline" onClick={reset}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Report */}
        {report && (
          <div className={`rounded-xl border p-4 space-y-3 ${report.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <div className="flex items-center gap-2">
              {report.success ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-red-600" />}
              <p className="font-semibold">{report.success ? 'Import Complete' : 'Import Failed'}</p>
            </div>
            {!report.success && <p className="text-sm text-red-800">{report.error}</p>}
            {report.success && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {[
                  { label: 'File', value: report.file_name },
                  { label: 'Rows in file', value: report.rows_in_file },
                  { label: 'New garments added', value: `+${report.new_garments_added}`, green: true },
                  { label: 'Existing updated', value: `↻${report.existing_garments_updated}`, blue: true },
                  { label: 'Skipped rows', value: report.skipped_rows },
                  { label: 'Errors', value: report.errors?.length ?? 0, warn: report.errors?.length > 0 },
                  { label: 'Deleted rows', value: 0, green: true },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`font-bold ${s.green ? 'text-green-700' : s.blue ? 'text-blue-700' : s.warn && s.value > 0 ? 'text-amber-700' : ''}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}
            {report.errors?.length > 0 && (
              <div className="bg-red-100 rounded p-2">
                {report.errors.map((e, i) => <p key={i} className="text-xs text-red-800">{e}</p>)}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={reset} className="gap-1"><Upload className="w-3.5 h-3.5" />Upload Another File</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section 3: My Approved Garments ───────────────────────────────────────
function GarmentsTable({ garments, loading, onRefresh }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [costUnder, setCostUnder] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editVals, setEditVals] = useState({});
  const [saving, setSaving] = useState(false);

  const brands = useMemo(() => [...new Set(garments.map(g => g.brand).filter(Boolean))].sort(), [garments]);

  const filtered = useMemo(() => {
    let rows = garments;
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(g =>
        (g.product_name || '').toLowerCase().includes(s) ||
        (g.sku || '').toLowerCase().includes(s) ||
        (g.brand || '').toLowerCase().includes(s) ||
        (g.style_number || '').toLowerCase().includes(s)
      );
    }
    if (filterBrand) rows = rows.filter(g => g.brand === filterBrand);
    if (filterMaterial) rows = rows.filter(g => g.material === filterMaterial);
    if (filterType) rows = rows.filter(g => g.product_type === filterType);
    if (filterStatus) rows = rows.filter(g => g.status === filterStatus);
    if (inStockOnly) rows = rows.filter(g => (Number(g.inventory_qty) || 0) > 0);
    if (costUnder) rows = rows.filter(g => (Number(g.blank_cost) || 0) < Number(costUnder));
    return rows;
  }, [garments, search, filterBrand, filterMaterial, filterType, filterStatus, inStockOnly, costUnder]);

  const selectedItems = filtered.filter(g => selected.has(g.id));
  const allPageSelected = filtered.length > 0 && filtered.every(g => selected.has(g.id));
  const toggleAll = () => {
    if (allPageSelected) setSelected(s => { const n = new Set(s); filtered.forEach(g => n.delete(g.id)); return n; });
    else setSelected(s => { const n = new Set(s); filtered.forEach(g => n.add(g.id)); return n; });
  };

  const bulkUpdate = async (updateFn, successMsg) => {
    if (selectedItems.length === 0) return;
    setSaving(true);
    try {
      for (const item of selectedItems) {
        await base44.entities.GarmentCatalog.update(item.id, updateFn(item));
      }
      toast.success(successMsg);
      setSelected(new Set());
      onRefresh();
    } catch (err) {
      toast.error('Bulk update failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (g) => {
    setEditingId(g.id);
    setEditVals({
      status: g.status || 'approved_to_sell',
      customer_price: g.customer_price || '',
      inventory_qty: g.inventory_qty ?? '',
      material: g.material || '',
      product_type: g.product_type || '',
    });
  };

  const saveEdit = async (g) => {
    setSaving(true);
    try {
      await base44.entities.GarmentCatalog.update(g.id, {
        status: editVals.status,
        customer_price: parseFloat(editVals.customer_price) || g.customer_price,
        inventory_qty: parseInt(editVals.inventory_qty) || 0,
        material: editVals.material,
        product_type: editVals.product_type,
      });
      toast.success('Saved');
      setEditingId(null);
      onRefresh();
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="w-7 h-7 bg-primary text-primary-foreground rounded-full text-sm flex items-center justify-center font-bold">3</span>
            My Approved Garments
            <span className="text-sm font-normal text-muted-foreground">({garments.length} total · {filtered.length} shown)</span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onRefresh} className="gap-1">
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
          <Input placeholder="Search name / SKU / brand…" value={search} onChange={e => setSearch(e.target.value)} className="col-span-1 sm:col-span-2" />
          <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white">
            <option value="">All Brands</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={filterMaterial} onChange={e => setFilterMaterial(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white">
            <option value="">All Materials</option>
            {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white">
            <option value="">All Types</option>
            {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white">
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={costUnder} onChange={e => setCostUnder(e.target.value)} className="border rounded-md px-3 py-2 text-sm bg-white">
            <option value="">Any Cost</option>
            <option value="8">Cost under $8</option>
            <option value="12">Cost under $12</option>
          </select>
          <label className="flex items-center gap-2 text-sm cursor-pointer col-span-1 sm:col-span-2">
            <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} className="rounded" />
            In Stock Only
          </label>
        </div>

        {/* Bulk actions */}
        {selectedItems.length > 0 && (
          <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{selectedItems.length} selected</span>
            <Button size="sm" disabled={saving} onClick={() => bulkUpdate(() => ({ status: 'approved_to_sell' }), 'Marked Approved to Sell')}
              className="bg-green-600 hover:bg-green-700 text-white text-xs">Approved to Sell</Button>
            <Button size="sm" disabled={saving} onClick={() => bulkUpdate(() => ({ status: 'maybe_later' }), 'Marked Maybe Later')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs">Maybe Later</Button>
            <Button size="sm" disabled={saving} onClick={() => bulkUpdate(() => ({ status: 'not_selling' }), 'Marked Not Selling')}
              className="bg-red-600 hover:bg-red-700 text-white text-xs">Not Selling</Button>
            <Button size="sm" disabled={saving} variant="outline"
              onClick={() => bulkUpdate(item => ({ customer_price: parseFloat(((item.blank_cost || 0) + 2).toFixed(2)) }), 'Price set to cost + $2')}
              className="text-xs">Price = Cost + $2</Button>
            <Button size="sm" disabled={saving} variant="outline"
              onClick={() => bulkUpdate(item => ({ customer_price: parseFloat(((item.blank_cost || 0) + 3).toFixed(2)) }), 'Price set to cost + $3')}
              className="text-xs">Price = Cost + $3</Button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground underline ml-auto">Clear</button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{garments.length === 0 ? 'No garments yet. Add one above or upload a CSV.' : 'No garments match current filters.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 border-b">
                <tr>
                  <th className="w-8 px-2 py-2">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleAll} className="rounded" />
                  </th>
                  {['Img','Brand','Style#','Product Name','Material','Type','Color','Size','SKU','Cost','Price','Inventory','Status','Edit'].map(h =>
                    <th key={h} className="text-left px-2 py-2 text-muted-foreground font-medium whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g, idx) => {
                  const isEditing = editingId === g.id;
                  const cost = Number(g.blank_cost) || 0;
                  const price = Number(g.customer_price) || 0;
                  return (
                    <tr key={g.id} className={`border-t transition-colors ${selected.has(g.id) ? 'bg-accent/10' : idx % 2 === 0 ? 'bg-white' : 'bg-muted/10'} hover:bg-accent/10`}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={selected.has(g.id)} onChange={() => {
                          setSelected(s => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; });
                        }} className="rounded" />
                      </td>
                      <td className="px-2 py-1.5">
                        {g.image_url
                          ? <img src={g.image_url} alt="" className="w-8 h-8 object-cover rounded border" onError={e => { e.target.style.display='none'; }} />
                          : <div className="w-8 h-8 rounded border bg-muted flex items-center justify-center text-muted-foreground text-xs">?</div>}
                      </td>
                      <td className="px-2 py-1.5 font-medium whitespace-nowrap">{g.brand}</td>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{g.style_number}</td>
                      <td className="px-2 py-1.5 max-w-36"><p className="truncate" title={g.product_name}>{g.product_name}</p></td>
                      <td className="px-2 py-1.5">
                        {isEditing
                          ? <select value={editVals.material} onChange={e => setEditVals(v => ({...v, material: e.target.value}))}
                              className="border rounded px-1 py-0.5 text-xs bg-white w-28">
                              <option value="">—</option>
                              {MATERIALS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          : <span className="text-muted-foreground">{g.material || '—'}</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing
                          ? <select value={editVals.product_type} onChange={e => setEditVals(v => ({...v, product_type: e.target.value}))}
                              className="border rounded px-1 py-0.5 text-xs bg-white w-24">
                              <option value="">—</option>
                              {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          : <span className="text-muted-foreground">{g.product_type || '—'}</span>}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{g.color}</td>
                      <td className="px-2 py-1.5">{g.size}</td>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{g.sku}</td>
                      <td className="px-2 py-1.5 text-right font-mono">${cost.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">
                        {isEditing
                          ? <Input type="number" step="0.01" value={editVals.customer_price}
                              onChange={e => setEditVals(v => ({...v, customer_price: e.target.value}))}
                              className="h-6 w-20 text-xs px-1 text-right" />
                          : <span className="font-semibold text-green-700">${price.toFixed(2)}</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing
                          ? <Input type="number" min="0" value={editVals.inventory_qty}
                              onChange={e => setEditVals(v => ({...v, inventory_qty: e.target.value}))}
                              className="h-6 w-16 text-xs px-1" />
                          : invBadge(g.inventory_qty)}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing
                          ? <select value={editVals.status} onChange={e => setEditVals(v => ({...v, status: e.target.value}))}
                              className="border rounded px-1 py-0.5 text-xs bg-white w-28">
                              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          : statusBadge(g.status)}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {isEditing
                          ? <div className="flex gap-1">
                              <Button size="sm" className="h-6 text-xs px-2" disabled={saving} onClick={() => saveEdit(g)}>
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => setEditingId(null)}>
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          : <Button size="sm" variant="ghost" className="h-6 text-xs px-2 gap-1" onClick={() => startEdit(g)}>
                              <Edit2 className="w-3 h-3" />Edit
                            </Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AdminGarmentCatalog() {
  const qc = useQueryClient();

  const { data: garments = [], isLoading, refetch } = useQuery({
    queryKey: ['garment-catalog'],
    queryFn: async () => {
      const all = [];
      let offset = 0;
      while (true) {
        const batch = await base44.entities.GarmentCatalog.filter({}, '-created_date', 500, offset);
        if (!batch || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < 500) break;
        offset += batch.length;
      }
      return all;
    },
  });

  const { data: draftProducts = [], refetch: refetchDrafts } = useQuery({
    queryKey: ['draft-garment-products'],
    queryFn: () => base44.entities.Product.filter({ visibility: 'draft', vendor_source: 'Garment Catalog' }, '-created_date', 50),
  });

  const refresh = () => {
    qc.invalidateQueries(['garment-catalog']);
    qc.invalidateQueries(['draft-garment-products']);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-5 px-4 shadow-md">
        <div className="container mx-auto">
          <h1 className="text-xl font-bold">Garment Catalog Manager</h1>
          <p className="text-primary-foreground/70 text-sm mt-0.5">
            {garments.length} garments · Append only · Nothing published automatically
          </p>
          {/* Admin nav */}
          <div className="flex gap-2 mt-3 flex-wrap">
            {[
              { to: '/AdminDashboard', label: 'Admin Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
              { to: '/AdminGarmentCatalog', label: 'Garment Catalog', icon: <Package className="w-3.5 h-3.5" />, active: true },
              { to: '/AdminProducts', label: 'Products', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
              { to: '/AdminVendorOrders', label: 'Vendor Orders', icon: <Truck className="w-3.5 h-3.5" /> },
              { to: '/AdminOrders', label: 'Orders', icon: <Package className="w-3.5 h-3.5" /> },
              { to: '/AdminOperationsDashboard', label: 'Operations Dashboard', icon: <BarChart3 className="w-3.5 h-3.5" /> },
            ].map(({ to, label, icon, active }) => (
              <Link key={to} to={to}>
                <button className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-yellow-400 text-gray-900 shadow-sm hover:bg-yellow-300'
                    : 'bg-white text-gray-800 border border-white/60 hover:bg-gray-100'
                }`}>
                  {icon}{label}
                </button>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
        <AddGarmentSection onAdded={refresh} />
        <UploadCSVSection onImported={refresh} />
        <BuildDraftProducts garments={garments} onRefresh={refresh} />
        <RepairProductImages onRefresh={refresh} />
        <DraftProductQA />
        <PublishTestProduct products={draftProducts} />
        <GarmentsTable garments={garments} loading={isLoading} onRefresh={refresh} />
      </div>
    </div>
  );
}