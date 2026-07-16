import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle, X, Loader2, Package } from 'lucide-react';
import { toast } from "sonner";

// Flexible header → field mapping. Add more aliases as needed for S&S column name variations.
const FIELD_MAP = {
  vendor:            ['vendor', 'vendor name', 'supplier'],
  brand:             ['brand', 'brand name', 'manufacturer', 'brand_name'],
  style_number:      ['style', 'style number', 'style#', 'style_number', 'style no', 'item number', 'item#', 'style num', 'catalog number', 'product style'],
  product_name:      ['product name', 'name', 'item name', 'product_name', 'title', 'product title', 'item description', 'product description'],
  description:       ['description', 'long description', 'full description', 'detail', 'details', 'extended description'],
  product_category:  ['category', 'product category', 'product type', 'product_category', 'dept', 'department', 'garment type', 'type'],
  color:             ['color', 'colour', 'color name', 'color_name', 'item color'],
  size:              ['size', 'size name', 'size_name', 'item size'],
  sku:               ['sku', 'upc', 'barcode', 'item sku', 'product sku', 'part number', 'item code'],
  image_url:         ['image url', 'image', 'image_url', 'photo url', 'img url', 'picture url', 'image link', 'photo link'],
  blank_cost:        ['cost', 'blank cost', 'your cost', 'unit cost', 'blank_cost', 'wholesale price', 'wholesale cost', 'price', 'net cost'],
  msrp:              ['msrp', 'retail', 'retail price', 'suggested retail', 'list price', 'srp', 'map price'],
  inventory_qty:     ['inventory', 'qty', 'quantity', 'qty on hand', 'stock', 'available qty', 'inv qty', 'available', 'on hand', 'quantity on hand'],
  warehouse_location:['warehouse', 'location', 'warehouse location', 'dc location', 'warehouse code'],
  weight:            ['weight', 'item weight', 'shipping weight'],
  case_quantity:     ['case qty', 'case quantity', 'units per case', 'case pack'],
  item_status:       ['status', 'item status', 'product status', 'availability'],
};

function normalizeHeader(h) {
  return h?.toString().trim().toLowerCase().replace(/[^a-z0-9 _]/g, '').replace(/\s+/g, ' ');
}

function mapRow(rowObj) {
  // rowObj is already a key→value object (from SheetJS)
  const normalizedObj = {};
  for (const [k, v] of Object.entries(rowObj)) {
    normalizedObj[normalizeHeader(k)] = v;
  }

  const mapped = {};
  for (const [field, aliases] of Object.entries(FIELD_MAP)) {
    for (const alias of aliases) {
      if (normalizedObj[alias] !== undefined && normalizedObj[alias] !== '') {
        mapped[field] = String(normalizedObj[alias]).trim();
        break;
      }
    }
  }

  // Coerce numeric fields
  ['blank_cost', 'msrp', 'inventory_qty', 'case_quantity'].forEach(f => {
    if (mapped[f] !== undefined) {
      const n = parseFloat(String(mapped[f]).replace(/[^0-9.]/g, ''));
      mapped[f] = isNaN(n) ? 0 : n;
    }
  });

  mapped.catalog_status = 'vendor_catalog_only';
  mapped.import_batch = new Date().toISOString().split('T')[0];
  if (!mapped.vendor) mapped.vendor = 'S&S Activewear';
  return mapped;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const splitLine = (line) => {
    const result = []; let cur = '', inQ = false;
    for (const c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += c; }
    }
    result.push(cur.trim());
    return result;
  };
  const rawHeaders = splitLine(lines[0]);
  return lines.slice(1).map(l => {
    const vals = splitLine(l);
    const rowObj = {};
    rawHeaders.forEach((h, i) => { rowObj[h] = vals[i] ?? ''; });
    return mapRow(rowObj);
  }).filter(r => r.product_name);
}

async function parseExcel(file) {
  // Dynamically load SheetJS from CDN
  await new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Excel parser'));
    document.head.appendChild(script);
  });
  const XLSX = window.XLSX;
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  // Use first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  // sheet_to_json gives array of {header: value} objects
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rawRows.map(mapRow).filter(r => r.product_name);
}

export default function SSImportUploader({ onImported }) {
   const [dragging, setDragging] = useState(false);
   const [loading, setLoading] = useState(false);
   const [preview, setPreview] = useState(null);   // { rows, fileName }
   const [importing, setImporting] = useState(false);
   const [importDone, setImportDone] = useState(false);
   const [importedRows, setImportedRows] = useState(null);

  const processFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      toast.error('Please upload a CSV or Excel (.xlsx / .xls) file');
      return;
    }
    setLoading(true);
    try {
      let rows;
      if (ext === 'csv') {
        const text = await file.text();
        rows = parseCSV(text);
      } else {
        rows = await parseExcel(file);
      }
      if (rows.length === 0) {
        toast.error('No valid product rows found. Check that the file has product data and recognizable column headers.');
        return;
      }
      setPreview({ rows, fileName: file.name });
    } catch (err) {
      toast.error('Failed to read file: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    processFile(e.dataTransfer.files[0]);
  };

  const handleConfirmImport = async () => {
     if (!preview?.rows?.length) return;
     setImporting(true);
     try {
       const now = new Date();
       const batchId = `batch-${now.getTime()}`;
       const importBatch = now.toISOString().split('T')[0];
       
       const response = await base44.functions.invoke('importSSMultiFile', {
         products_data: convertToTSV(preview.rows),
         import_batch: importBatch,
         import_batch_id: batchId,
         source_file_name: preview.fileName
       });

       if (response.data.success) {
         setImportedRows(preview.rows);
         setImportDone(true);
         setPreview(null);

         // Show import summary
         const summary = response.data.results;
         const msg = `Import complete: +${summary.new_skus_added} new, ↻${summary.existing_skus_updated} updated, total catalog ${summary.rows_after_import} rows, 0 deleted`;
         toast.success(msg);
         onImported?.();
       } else {
         toast.error('Import failed: ' + response.data.error);
       }
     } catch (err) {
       toast.error('Import failed: ' + err.message);
     } finally {
       setImporting(false);
     }
   };

   const convertToTSV = (rows) => {
     if (!rows.length) return '';
     const headers = Object.keys(rows[0]);
     const headerLine = headers.join('\t');
     const dataLines = rows.map(row => 
       headers.map(h => String(row[h] || '')).join('\t')
     );
     return [headerLine, ...dataLines].join('\n');
   };

  // ── Import success view ──────────────────────────────────────────────────────
  if (importDone) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-bold text-green-800">Import Complete — {importedRows.length} products saved</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Import complete. Products are saved in the S&S Vendor Catalog and are hidden from the public shop until approved.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border mb-5">
          <table className="text-xs w-full min-w-[800px]">
            <thead className="bg-muted">
              <tr>
                {['Brand','Style #','Product Name','Category','Color','Size','SKU','Blank Cost','Inventory','Image URL','Status'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {importedRows.map((r, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap">{r.brand || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.style_number || '—'}</td>
                  <td className="px-3 py-2 max-w-[160px] truncate">{r.product_name}</td>
                  <td className="px-3 py-2">{r.product_category || '—'}</td>
                  <td className="px-3 py-2">{r.color || '—'}</td>
                  <td className="px-3 py-2">{r.size || '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.sku || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-primary">{r.blank_cost ? `$${r.blank_cost.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={r.inventory_qty > 0 ? 'text-green-700 font-medium' : 'text-muted-foreground'}>
                      {r.inventory_qty ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[120px]">
                    {r.image_url
                      ? <a href={r.image_url} target="_blank" rel="noreferrer" className="text-primary underline truncate block">View</a>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-3 py-2">
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">Catalog Only</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Button variant="outline" onClick={() => { setImportDone(false); setImportedRows([]); }}>
          Import Another File
        </Button>
      </div>
    );
  }

  // ── Preview / confirm view ───────────────────────────────────────────────────
   if (preview) {
     return (
       <div className="bg-white rounded-2xl border shadow-sm p-6">
         <div className="flex items-center justify-between mb-3">
           <div className="flex items-center gap-2">
             <FileSpreadsheet className="w-5 h-5 text-primary" />
             <h3 className="font-bold">Preview — {preview.fileName}</h3>
           </div>
           <Button variant="ghost" size="icon" onClick={() => setPreview(null)}><X className="w-4 h-4" /></Button>
         </div>

         {/* Safety message */}
         <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
           <p className="text-sm text-blue-900">
             <strong>✓ Safe append mode:</strong> This import will append and update S&S catalog records. It will not replace or delete previous imports. 
             New SKUs will be added, existing SKUs will be updated by Vendor + SKU.
           </p>
         </div>

         <p className="text-sm text-muted-foreground mb-4">
           <strong>{preview.rows.length}</strong> product rows detected. Review below, then confirm to save.
           All will be imported as <strong>Vendor Catalog Only</strong> — hidden from public shop.
         </p>

         <div className="overflow-x-auto rounded-lg border mb-5">
          <table className="text-xs w-full min-w-[800px]">
            <thead className="bg-muted">
              <tr>
                {['Brand','Style #','Product Name','Category','Color','Size','SKU','Blank Cost','Inventory','Image URL','Status'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.rows.map((r, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap">{r.brand || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.style_number || '—'}</td>
                  <td className="px-3 py-2 max-w-[160px] truncate">{r.product_name}</td>
                  <td className="px-3 py-2">{r.product_category || '—'}</td>
                  <td className="px-3 py-2">{r.color || '—'}</td>
                  <td className="px-3 py-2">{r.size || '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.sku || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-primary">{r.blank_cost ? `$${r.blank_cost.toFixed(2)}` : '—'}</td>
                  <td className="px-3 py-2">
                    <span className={r.inventory_qty > 0 ? 'text-green-700 font-medium' : 'text-muted-foreground'}>
                      {r.inventory_qty ?? '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-[120px]">
                    {r.image_url
                      ? <a href={r.image_url} target="_blank" rel="noreferrer" className="text-primary underline truncate block">View</a>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-3 py-2">
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full whitespace-nowrap">Catalog Only</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3">
          <Button onClick={handleConfirmImport} disabled={importing} className="bg-primary text-primary-foreground gap-2">
            {importing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
              : `Confirm Import — ${preview.rows.length} Products`}
          </Button>
          <Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button>
        </div>
      </div>
    );
  }

  // ── Upload dropzone ──────────────────────────────────────────────────────────
  return (
    <div
      className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors ${loading ? 'border-primary bg-primary/5' : dragging ? 'border-primary bg-primary/5' : 'border-border bg-white hover:border-primary/50'} ${loading ? 'cursor-wait' : 'cursor-pointer'}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !loading && document.getElementById('ss-file-input').click()}
    >
      <input
        id="ss-file-input" type="file" accept=".csv,.xlsx,.xls" className="hidden"
        onChange={e => processFile(e.target.files[0])}
      />

      {loading ? (
        <>
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-3" />
          <p className="font-semibold text-foreground mb-1">Reading file…</p>
          <p className="text-sm text-muted-foreground">Mapping columns to S&S Catalog fields</p>
        </>
      ) : (
        <>
          <FileSpreadsheet className="w-12 h-12 text-primary/40 mx-auto mb-3" />
          <p className="font-semibold text-foreground mb-1">Drop your S&S export here</p>
          <p className="text-sm text-muted-foreground mb-1">Supports <strong>Products.xlsx</strong>, any S&S export, or a test file</p>
          <p className="text-sm text-muted-foreground mb-4">CSV and Excel (.xlsx / .xls) accepted</p>
          <Button variant="outline" className="border-primary text-primary gap-2 pointer-events-none">
            <Upload className="w-4 h-4" /> Choose File
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Products are saved as <strong>Vendor Catalog Only</strong> — nothing is published automatically.
          </p>
        </>
      )}
    </div>
  );
}