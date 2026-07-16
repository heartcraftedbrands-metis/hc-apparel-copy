import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, AlertCircle, CheckCircle2, FileCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function SSImportUploaderNew({ onImported }) {
  const [validating, setValidating] = useState(false);
  const [staging, setStaging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [file, setFile] = useState(null);
  const [session, setSession] = useState(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setResult(null);
      setSession(null);
    }
  };

  const handleStageFile = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setValidating(true);
    try {
      const text = await file.text();
      const stageResult = await base44.functions.invoke('stageSSImportFile', {
        file_content: text,
        file_name: file.name,
      });

      if (stageResult.data.success) {
        setSession(stageResult.data);
        toast.success(`File staged: ${stageResult.data.total_staged_rows} rows ready to import`);
      } else {
        toast.error('Staging failed: ' + stageResult.data.error);
      }
    } catch (err) {
      toast.error('Staging error: ' + err.message);
      setResult({
        success: false,
        error: err.message
      });
    } finally {
      setValidating(false);
    }
  };

  const handleImportChunk = async (chunkSize = 25, isAuto = false) => {
    if (!session) {
      toast.error('Please stage a file first');
      return;
    }

    setImporting(true);
    try {
      const importResult = await base44.functions.invoke('importSSFromStaging', {
        import_session_id: session.import_session_id,
        chunk_size: chunkSize,
      });

      if (!importResult.data.success) {
        toast.error('Chunk import failed: ' + importResult.data.error);
        setResult(importResult.data);
        setImporting(false);
        return;
      }

      const data = importResult.data;
      setSession(prev => ({
        ...prev,
        pending_rows: data.session_pending_rows,
        imported_rows: data.session_imported_rows,
        updated_rows: data.session_updated_rows,
        skipped_rows: data.session_skipped_rows,
        error_rows: data.session_error_rows,
      }));
      setResult(data);
      toast.success(`Processed ${data.rows_processed_this_chunk} rows`);

      // Auto-continue if requested and rows pending
      if (isAuto && data.session_pending_rows > 0) {
        setTimeout(() => handleImportChunk(chunkSize, true), 500);
      }
    } catch (err) {
      toast.error('Import error: ' + err.message);
      setImporting(false);
    } finally {
      if (!isAuto) setImporting(false);
    }
  };

  return (
    <Card className="border-accent/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Staged S&S Import
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            onChange={handleFileChange}
            className="hidden"
            id="ss-file-input"
          />
          <label htmlFor="ss-file-input" className="cursor-pointer">
            <div className="text-sm text-muted-foreground">
              {file ? file.name : 'Click to select CSV or Excel file'}
            </div>
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleStageFile}
            disabled={!file || validating || session}
            className="w-full bg-accent hover:bg-accent/90"
          >
            {validating ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Staging...
              </>
            ) : (
              <>
                <FileCheck className="w-4 h-4" />
                Validate & Stage File
              </>
            )}
          </Button>

          <div className="flex flex-col gap-2 pt-2">
            <p className="text-xs font-semibold text-slate-700">Import from staging:</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => handleImportChunk(25, false)}
                disabled={importing || !session || session.pending_rows === 0}
                variant="outline"
                className="text-xs"
              >
                {importing ? (
                  <div className="w-2 h-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Upload className="w-3 h-3" /> Import Next 25</>
                )}
              </Button>
              <Button
                onClick={() => handleImportChunk(50, false)}
                disabled={importing || !session || session.pending_rows === 0}
                variant="outline"
                className="text-xs"
              >
                {importing ? (
                  <div className="w-2 h-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Upload className="w-3 h-3" /> Import Next 50</>
                )}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => handleImportChunk(100, false)}
                disabled={importing || !session || session.pending_rows === 0}
                variant="outline"
                className="text-xs"
              >
                {importing ? (
                  <div className="w-2 h-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Upload className="w-3 h-3" /> Import Next 100</>
                )}
              </Button>
              <Button
                onClick={() => handleImportChunk(25, true)}
                disabled={importing || !session || session.pending_rows === 0}
                variant="outline"
                className="text-xs"
              >
                {importing ? (
                  <div className="w-2 h-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Upload className="w-3 h-3" /> Resume Staged Import</>
                )}
              </Button>
            </div>
            <Button
              onClick={() => {
                setSession(null);
                setResult(null);
                toast.success('Import session cancelled');
              }}
              disabled={importing || !session}
              variant="outline"
              className="w-full text-xs text-red-700 hover:text-red-900"
            >
              ✕ Cancel Import Session
            </Button>
          </div>
          {session && session.pending_rows === 0 && (
            <div className="pt-2">
              <Button
                onClick={() => {
                  if (onImported) onImported();
                  setSession(null);
                  setFile(null);
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                ✓ Import Complete - Refresh Catalog
              </Button>
            </div>
          )}
        </div>

        {/* Session progress */}
        {session && (
          <div className="rounded-lg p-4 bg-slate-50 border border-slate-200">
            <div className="text-sm space-y-2">
              <p className="font-semibold">Import Session Progress</p>
              <div className="text-xs space-y-1">
                <p><strong>File:</strong> {session.file_name}</p>
                <p><strong>Session ID:</strong> {session.import_session_id}</p>
                <p><strong>Total staged rows:</strong> {session.total_staged_rows}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 bg-slate-200 rounded">
                    <div
                      className="h-full bg-blue-500 rounded transition-all"
                      style={{ width: `${((session.total_staged_rows - (session.pending_rows || 0)) / session.total_staged_rows) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold">{session.total_staged_rows - (session.pending_rows || 0)}/{session.total_staged_rows}</span>
                </div>
                <p className="text-slate-700"><strong>Pending rows:</strong> {session.pending_rows || 0}</p>
                <p className="text-green-700"><strong>Imported rows:</strong> +{session.imported_rows || 0}</p>
                <p className="text-blue-700"><strong>Updated rows:</strong> ↻{session.updated_rows || 0}</p>
                {(session.skipped_rows || 0) > 0 && (
                  <p className="text-amber-700"><strong>Skipped rows:</strong> {session.skipped_rows}</p>
                )}
                {(session.error_rows || 0) > 0 && (
                  <p className="text-red-700"><strong>Error rows:</strong> {session.error_rows}</p>
                )}
                <p className="text-red-700"><strong>Deleted rows:</strong> 0</p>
              </div>
            </div>
          </div>
        )}

        {/* Chunk result */}
        {result && (
          <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-700 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-700 mt-0.5 flex-shrink-0" />
              )}
              <div className="text-sm flex-1">
                <p className={`font-semibold ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                  {result.success ? 'Chunk Processed' : 'Chunk Failed'}
                </p>
                {result.success && (
                  <div className="text-xs mt-2 space-y-1">
                    <p>Rows processed this chunk: {result.rows_processed_this_chunk}</p>
                    <p className="text-green-700">New SKUs: +{result.new_skus_added || 0}</p>
                    <p className="text-blue-700">Updated SKUs: ↻{result.existing_skus_updated || 0}</p>
                    <p className="text-amber-700">Skipped rows: {result.rows_skipped || 0}</p>
                    <p>Catalog rows before: {result.catalog_rows_before}</p>
                    <p>Catalog rows after: {result.catalog_rows_after}</p>
                    <p className="text-red-700">Deleted rows: {result.rows_deleted}</p>
                  </div>
                )}
                {result.error && <p className="text-red-700 mt-2"><strong>Error:</strong> {result.error}</p>}
                {result.error_log?.length > 0 && (
                  <div className="bg-white p-2 rounded mt-2 max-h-32 overflow-y-auto border border-red-200">
                    <p className="text-xs font-semibold text-red-700 mb-1">Errors:</p>
                    {result.error_log.slice(0, 10).map((e, i) => (
                      <p key={i} className="text-xs text-red-600">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}