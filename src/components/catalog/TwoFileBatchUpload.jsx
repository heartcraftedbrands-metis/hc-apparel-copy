import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, CheckCircle2, XCircle, Clock, Loader2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABELS = {
  waiting:    { label: 'Waiting',    color: 'text-muted-foreground', icon: Clock },
  validating: { label: 'Validating', color: 'text-amber-600',       icon: Loader2 },
  importing:  { label: 'Importing',  color: 'text-blue-600',        icon: Loader2 },
  completed:  { label: 'Completed',  color: 'text-green-700',       icon: CheckCircle2 },
  failed:     { label: 'Failed',     color: 'text-red-700',         icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_LABELS[status] || STATUS_LABELS.waiting;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      <Icon className={`w-3.5 h-3.5 ${status === 'validating' || status === 'importing' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

function FileReport({ report, fileName }) {
  if (!report) return null;
  return (
    <div className={`rounded-lg border p-3 text-xs space-y-2 ${report.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <p className="font-semibold">{report.success ? '✅' : '❌'} {fileName}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Rows in file:</span><span className="font-medium">{report.rows_in_file ?? '—'}</span>
        <span className="text-muted-foreground">New SKUs added:</span><span className="font-medium text-green-700">+{report.new_skus_added ?? 0}</span>
        <span className="text-muted-foreground">Existing updated:</span><span className="font-medium text-blue-700">↻{report.existing_skus_updated ?? 0}</span>
        <span className="text-muted-foreground">Rows skipped:</span><span className="font-medium">{report.rows_skipped ?? 0}</span>
        <span className="text-muted-foreground">Errors:</span><span className={`font-medium ${(report.errors?.length || 0) > 0 ? 'text-red-700' : 'text-green-700'}`}>{report.errors?.length ?? 0}</span>
        <span className="text-muted-foreground">Deleted rows:</span><span className="font-bold text-green-700">0</span>
        <span className="text-muted-foreground">Total after import:</span><span className="font-bold">{report.catalog_rows_after ?? '—'}</span>
      </div>
      {report.errors?.length > 0 && (
        <div className="bg-red-100 rounded p-2 max-h-24 overflow-y-auto">
          {report.errors.slice(0, 10).map((e, i) => <p key={i} className="text-red-700">{e}</p>)}
        </div>
      )}
      {!report.success && report.error && (
        <p className="text-red-700 font-medium">{report.error}</p>
      )}
    </div>
  );
}

export default function TwoFileBatchUpload({ onImportComplete }) {
  const [files, setFiles] = useState([null, null]);
  const [statuses, setStatuses] = useState(['waiting', 'waiting']);
  const [reports, setReports] = useState([null, null]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef();

  const setStatus = (idx, s) => setStatuses(prev => { const n = [...prev]; n[idx] = s; return n; });
  const setReport = (idx, r) => setReports(prev => { const n = [...prev]; n[idx] = r; return n; });

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || []).slice(0, 2);
    if (selected.length === 0) return;

    // Validate CSV only + size
    const validated = [];
    for (const f of selected) {
      if (!f.name.toLowerCase().endsWith('.csv')) {
        toast.error(`${f.name} is not a CSV file. Only .csv files are accepted.`);
        return;
      }
      validated.push(f);
    }

    setFiles([validated[0] || null, validated[1] || null]);
    setStatuses(['waiting', 'waiting']);
    setReports([null, null]);
    // Reset input so same files can be re-selected
    e.target.value = '';
  };

  const processFile = async (file, idx) => {
    if (!file) return true; // skip slot
    setStatus(idx, 'validating');

    let text;
    try {
      text = await file.text();
    } catch {
      setStatus(idx, 'failed');
      setReport(idx, { success: false, error: 'Failed to read file.' });
      return false;
    }

    // Count rows (skip header)
    const rows = text.split('\n').filter(l => l.trim()).length - 1;
    if (rows > 500) {
      setStatus(idx, 'failed');
      setReport(idx, { success: false, error: `File has ${rows} rows. Max 500 rows per file.` });
      return false;
    }

    // Validate
    let preview;
    try {
      const res = await base44.functions.invoke('importVendorCatalogCSV', {
        csv_content: text, file_name: file.name, preview_only: true,
      });
      if (!res.data.success) {
        setStatus(idx, 'failed');
        setReport(idx, { success: false, error: res.data.error || 'Validation failed.' });
        return false;
      }
      preview = res.data;
    } catch (err) {
      setStatus(idx, 'failed');
      setReport(idx, { success: false, error: 'Validation error: ' + err.message });
      return false;
    }

    // Import
    setStatus(idx, 'importing');
    try {
      const res = await base44.functions.invoke('importVendorCatalogCSV', {
        csv_content: text, file_name: file.name, preview_only: false,
      });
      const data = res.data;
      setReport(idx, data);
      if (!data.success) {
        setStatus(idx, 'failed');
        return false;
      }
      setStatus(idx, 'completed');
      return true;
    } catch (err) {
      // Rate limit retry
      if (err.message?.includes('429') || err.message?.toLowerCase().includes('rate')) {
        toast.warning(`Rate limit hit on file ${idx + 1}. Waiting 30 seconds and retrying…`);
        await new Promise(r => setTimeout(r, 30_000));
        try {
          const res2 = await base44.functions.invoke('importVendorCatalogCSV', {
            csv_content: text, file_name: file.name, preview_only: false,
          });
          const data2 = res2.data;
          setReport(idx, data2);
          setStatus(idx, data2.success ? 'completed' : 'failed');
          return data2.success;
        } catch (err2) {
          setStatus(idx, 'failed');
          setReport(idx, { success: false, error: 'Retry failed: ' + err2.message });
          return false;
        }
      }
      setStatus(idx, 'failed');
      setReport(idx, { success: false, error: 'Import error: ' + err.message });
      return false;
    }
  };

  const runQueue = async () => {
    if (!files[0] && !files[1]) { toast.error('Select at least one CSV file.'); return; }
    setRunning(true);
    setReports([null, null]);

    // File 1
    const ok1 = await processFile(files[0], 0);

    // Wait 2 seconds between files
    if (files[1]) {
      await new Promise(r => setTimeout(r, 2000));

      if (!ok1) {
        toast.error(`File 1 failed. Stopping queue — File 2 was not imported.`);
        setStatus(1, 'failed');
        setReport(1, { success: false, error: 'Skipped because File 1 failed.' });
        setRunning(false);
        return;
      }

      await processFile(files[1], 1);
    }

    setRunning(false);
    if (onImportComplete) onImportComplete();
    toast.success('Batch queue complete.');
  };

  const reset = () => {
    setFiles([null, null]);
    setStatuses(['waiting', 'waiting']);
    setReports([null, null]);
  };

  const hasFiles = files[0] || files[1];

  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-blue-900">
          <Upload className="w-4 h-4" />
          Upload Two CSV Batches (Sequential Queue)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warning */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Do not upload manifest files.</strong> Upload only numbered 50-row batch CSV files.
            Files are processed one after the other to avoid rate limits. Max 500 rows per file.
          </div>
        </div>

        {/* File selector */}
        <label className="block cursor-pointer">
          <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${hasFiles ? 'border-blue-400 bg-blue-50' : 'border-border hover:border-blue-300'}`}>
            <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">Click to select up to 2 CSV files</p>
            <p className="text-xs text-muted-foreground mt-1">CSV only · Max 500 rows each · Processed sequentially</p>
          </div>
          <input type="file" accept=".csv" multiple onChange={handleFileSelect} className="hidden" ref={inputRef} />
        </label>

        {/* Queue status */}
        {(files[0] || files[1]) && (
          <div className="space-y-2">
            {[0, 1].map(idx => {
              const f = files[idx];
              if (!f && idx === 1) return null;
              return (
                <div key={idx} className="bg-white border rounded-lg px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold">{f ? `File ${idx + 1}: ${f.name}` : `File ${idx + 1}: —`}</p>
                      {f && <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</p>}
                      {!f && <p className="text-xs text-muted-foreground">No file selected for this slot</p>}
                    </div>
                    <StatusBadge status={statuses[idx]} />
                  </div>
                  {reports[idx] && <FileReport report={reports[idx]} fileName={f?.name || `File ${idx + 1}`} />}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={runQueue}
            disabled={running || (!files[0] && !files[1])}
            className="flex-1 bg-blue-700 hover:bg-blue-800 text-white gap-2"
          >
            {running
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing Queue…</>
              : <><Upload className="w-4 h-4" /> Start Sequential Import</>
            }
          </Button>
          {hasFiles && !running && (
            <Button variant="outline" onClick={reset}>Reset</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}