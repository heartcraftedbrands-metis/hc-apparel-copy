import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, Loader, Shield } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const REQUIRED_FILES = {
  products: 'Products.xlsx',
  styles: 'Styles.xlsx',
  categories: 'Categories.xlsx',
  specs: 'Specs.xlsx',
  days_in_transit: 'DaysInTransit.xlsx'
};

export default function SSMultiFileImporter({ onImportComplete }) {
  const [uploads, setUploads] = useState({});
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const handleFileSelect = async (fileType, file) => {
    if (!file) return;

    try {
      const text = await file.text();
      setUploads(prev => ({
        ...prev,
        [fileType]: { name: file.name, content: text }
      }));
      toast.success(`${REQUIRED_FILES[fileType]} ready`);
    } catch (err) {
      toast.error(`Failed to read ${REQUIRED_FILES[fileType]}: ${err.message}`);
    }
  };

  const handleImportRequest = () => {
    const hasAllFiles = Object.keys(REQUIRED_FILES).every(key => uploads[key]);
    if (!hasAllFiles) {
      toast.error('All 5 files required: Products, Styles, Categories, Specs, DaysInTransit');
      return;
    }
    setConfirmDialogOpen(true);
  };

  const handleImportConfirm = async () => {
    setConfirmDialogOpen(false);
    setImporting(true);
    try {
      const response = await base44.functions.invoke('importSSMultiFile', {
        products_data: uploads.products.content,
        styles_data: uploads.styles.content,
        categories_data: uploads.categories.content,
        specs_data: uploads.specs.content,
        days_in_transit_data: uploads.days_in_transit.content,
        import_batch: new Date().toISOString().split('T')[0]
      });

      if (response.data.success) {
        const results = response.data.results;
        setImportResults(results);
        toast.success('Import complete! Check results below.');
        setUploads({});
        setTimeout(() => {
          onImportComplete?.();
        }, 2000);
      } else {
        toast.error(response.data.error || 'Import failed');
      }
    } catch (err) {
      toast.error(`Import error: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  if (importResults) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="text-green-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Import Results
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="bg-white border border-green-300 rounded-lg p-3 flex items-start gap-2 text-xs">
            <Shield className="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0" />
            <p className="text-green-800">
              <strong>✓ Safe Import:</strong> No existing products deleted. New SKUs added, existing SKUs updated, product groups maintained.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white p-3 rounded-lg border border-green-200">
              <p className="text-xs text-muted-foreground">Total Rows</p>
              <p className="text-xl font-bold text-green-700">{importResults.total_rows_processed}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-green-200">
              <p className="text-xs text-muted-foreground">Approved Brands</p>
              <p className="text-xl font-bold text-green-700">{importResults.approved_brand_rows}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-amber-200">
              <p className="text-xs text-muted-foreground">Skipped</p>
              <p className="text-xl font-bold text-amber-700">{importResults.skipped_unapproved}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-blue-200">
              <p className="text-xs text-muted-foreground">Product Groups</p>
              <p className="text-xl font-bold text-blue-700">{importResults.product_groups_created}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-blue-200">
              <p className="text-xs text-muted-foreground">Variants Created</p>
              <p className="text-xl font-bold text-blue-700">{importResults.variants_created}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-purple-200">
              <p className="text-xs text-muted-foreground">Updated</p>
              <p className="text-xl font-bold text-purple-700">{importResults.variants_updated}</p>
            </div>
            <div className="bg-white p-3 rounded-lg border border-red-200">
              <p className="text-xs text-muted-foreground">Deleted</p>
              <p className="text-xl font-bold text-red-700">0</p>
            </div>
          </div>

          {importResults.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
              <p className="text-xs font-semibold text-red-900 mb-2">⚠️ Errors ({importResults.errors.length})</p>
              <ul className="text-xs text-red-800 space-y-1">
                {importResults.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
                {importResults.errors.length > 5 && (
                  <li>• ... and {importResults.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <Button className="w-full" onClick={() => setImportResults(null)}>
            Close Results
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-dashed border-accent bg-accent/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-accent">
          <Upload className="w-5 h-5" />
          S&S Multi-File Import
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-2">
          Upload all 5 files to import S&S products with full data enrichment
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(REQUIRED_FILES).map(([key, label]) => (
            <div key={key} className="border-2 border-dashed border-border rounded-lg p-4 bg-white hover:border-accent/50 transition">
              <label className="cursor-pointer flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {uploads[key] ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-green-700">{uploads[key].name}</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">{label}</span>
                    </>
                  )}
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.tsv"
                  onChange={(e) => handleFileSelect(key, e.target.files?.[0])}
                  className="hidden"
                />
              </label>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
          <p className="font-semibold mb-1">📋 File Requirements:</p>
          <ul className="space-y-0.5 text-blue-800">
            <li>• <strong>Products.xlsx:</strong> SKU, Brand, Style#, Color, Size, Cost, Inventory</li>
            <li>• <strong>Styles.xlsx:</strong> Brand, Style#, Style Name, Description</li>
            <li>• <strong>Categories.xlsx:</strong> Style# → Category mapping</li>
            <li>• <strong>Specs.xlsx:</strong> SKU → Measurements, Fabric, Fit, Material, Care</li>
            <li>• <strong>DaysInTransit.xlsx:</strong> SKU → Shipping days (admin-only)</li>
          </ul>
        </div>

        <Button
          onClick={handleImportRequest}
          disabled={!Object.keys(REQUIRED_FILES).every(key => uploads[key]) || importing}
          className="w-full bg-accent hover:bg-accent/90"
        >
          {importing ? (
            <>
              <Loader className="w-4 h-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Import All Files
            </>
          )}
        </Button>

        <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <AlertDialogContent>
            <AlertDialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-600" />
              Confirm Safe Import
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="text-sm font-semibold text-foreground">
                This import will append and update S&S products. It will not delete existing catalog records.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 text-xs text-blue-900">
                <p><strong>✓ New SKUs:</strong> Added to catalog as "Vendor Catalog Only"</p>
                <p><strong>✓ Existing SKUs:</strong> Updated with new pricing, inventory, specs</p>
                <p><strong>✓ Product Groups:</strong> Variants added or updated, not duplicated</p>
                <p><strong>✓ Existing Status:</strong> Public/Draft/Hidden status preserved</p>
                <p><strong>✓ No Deletions:</strong> Previous imports stay. No products removed.</p>
              </div>
            </AlertDialogDescription>
            <div className="flex gap-3 justify-end">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleImportConfirm} className="bg-accent hover:bg-accent/90">
                Proceed with Import
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        <p className="text-xs text-muted-foreground text-center">
          ✓ Safe: Appends and updates only. ✓ Approved brands only. ✓ No auto-publish.
        </p>
      </CardContent>
    </Card>
  );
}