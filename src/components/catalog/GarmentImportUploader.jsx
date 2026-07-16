import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function GarmentImportUploader({ onImportComplete }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const response = await base44.functions.invoke('importGarmentCSV', {
        file_url,
        file_name: file.name,
      });

      // base44 SDK wraps response in .data
      const data = response?.data ?? response;

      if (data?.error) {
        // Build a detailed error message from the response body
        let msg = data.error;
        if (data.detected_headers?.length) msg += `\n\nDetected columns: ${data.detected_headers.join(', ')}`;
        if (data.mapped_to?.length) msg += `\nMapped to: ${data.mapped_to.join(', ')}`;
        if (data.fix) msg += `\n\n💡 Fix: ${data.fix}`;
        if (data.skipped_detail?.length) msg += `\n\nSkipped rows:\n${data.skipped_detail.map(s => `  Row ${s.row}: ${s.reason}`).join('\n')}`;
        if (data.row_errors?.length) msg += `\n\nRow errors:\n${data.row_errors.map(e => `  Row ${e.row} [${e.field}]: ${e.reason}`).join('\n')}`;
        setError(msg);
        return;
      }

      setResult(data);
      if (onImportComplete) onImportComplete(data);
    } catch (err) {
      // Try to extract error detail from Axios error response body
      const respData = err?.response?.data;
      if (respData?.error) {
        let msg = respData.error;
        if (respData.detected_headers?.length) msg += `\n\nDetected columns: ${respData.detected_headers.join(', ')}`;
        if (respData.fix) msg += `\n\n💡 Fix: ${respData.fix}`;
        if (respData.skipped_detail?.length) msg += `\n\nSkipped rows:\n${respData.skipped_detail.map(s => `  Row ${s.row}: ${s.reason}`).join('\n')}`;
        setError(msg);
      } else {
        setError(err.message || 'Import failed');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold mb-1">Import Garment CSV</h3>
        <p className="text-sm text-muted-foreground">Upload a CSV file with product data. Products will be imported as drafts.</p>
      </div>

      {error && (
        <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="whitespace-pre-wrap font-mono text-xs">{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <div className="flex gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="font-semibold">Import completed</span>
          </div>
          <div className="ml-6 space-y-1 text-xs">
            <p>CSV accepted: yes</p>
            <p>Rows in file: {result.rows_in_file || 0}</p>
            <p>Rows processed: {result.rows_processed || 0}</p>
            <p>New garments added: {result.new_garments_added || 0}</p>
            <p>Existing garments updated: {result.existing_garments_updated || 0}</p>
            <p>Rows skipped: {result.skipped_rows || 0}</p>
            <p>Products published: 0</p>
            {result.skipped_detail?.length > 0 && (
              <div className="mt-1 text-amber-700">
                <p className="font-semibold">Skipped rows:</p>
                {result.skipped_detail.map((s, i) => <p key={i}>Row {s.row}{s.sku ? ` [${s.sku}]` : ''}: {s.reason}</p>)}
              </div>
            )}
            {result.import_errors?.length > 0 && (
              <div className="mt-1 text-red-700">
                <p className="font-semibold">Import errors:</p>
                {result.import_errors.map((e, i) => <p key={i}>SKU {e.sku}: {e.reason}</p>)}
              </div>
            )}
          </div>
        </div>
      )}

      <label className="flex items-center gap-3 border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-primary transition-colors group">
        <Upload className="w-5 h-5 text-muted-foreground group-hover:text-primary flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">
            {uploading ? 'Uploading…' : 'Click to upload CSV'}
          </p>
          <p className="text-xs text-muted-foreground">product_name, brand, style_number, color, size, sku, blank_cost, price, inventory, image_url</p>
        </div>
        <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} disabled={uploading} />
      </label>

      {uploading && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Processing...
        </div>
      )}
    </div>
  );
}