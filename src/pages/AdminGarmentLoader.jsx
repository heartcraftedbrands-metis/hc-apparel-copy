import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Package, AlertTriangle } from 'lucide-react';
import GarmentImportUploader from '@/components/catalog/GarmentImportUploader';
import DraftProductBuilder from '@/components/catalog/DraftProductBuilder';
import ProductQARunner from '@/components/catalog/ProductQARunner';
import RepairDraftImages from '@/components/catalog/RepairDraftImages';
import ApproveDraftProducts from '@/components/catalog/ApproveDraftProducts';

export default function AdminGarmentLoader() {
  const [importResult, setImportResult] = useState(null);
  const [buildResult, setBuildResult] = useState(null);
  const [qaResult, setQAResult] = useState(null);

  const { data: draftProducts = [] } = useQuery({
    queryKey: ['draft_products'],
    queryFn: () => base44.entities.Product.filter({ visibility: 'draft' }, '-created_date', 100),
  });

  const { data: publicProducts = [] } = useQuery({
    queryKey: ['public_products'],
    queryFn: () => base44.entities.Product.filter({ visibility: 'public' }, '-created_date', 100),
  });

  const draftCount = draftProducts.length;
  const publicCount = publicProducts.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-8 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          <Link to="/AdminDashboard" className="inline-flex items-center gap-1.5 text-xs text-primary-foreground/60 hover:text-primary-foreground mb-3 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />Back to Admin Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <Package className="w-7 h-7 text-accent" />
            <div>
              <h1 className="text-2xl font-extrabold">Garment Product Loader</h1>
              <p className="text-primary-foreground/70 text-sm">Import, build, QA, and approve garment products safely</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">

        {/* Status Cards */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">Draft Products</p>
            <p className="text-3xl font-bold text-blue-900">{draftCount}</p>
            <p className="text-sm text-blue-600 mt-1">Awaiting QA and approval</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-700 mb-1">Public Products</p>
            <p className="text-3xl font-bold text-green-900">{publicCount}</p>
            <p className="text-sm text-green-600 mt-1">Live on shop</p>
          </div>
        </div>

        {/* Workflow */}
        <div className="space-y-6">
          <div className="border-t-2 border-dashed border-border pt-4">
            <h2 className="text-lg font-bold mb-2">Product Loading Workflow</h2>
            <p className="text-sm text-muted-foreground mb-4">Follow these steps to safely load new products as drafts.</p>
          </div>

          {/* Step 1: Import */}
          <div className="bg-white border-l-4 border-primary rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">1</div>
              <h3 className="text-base font-bold">Import CSV</h3>
            </div>
            <GarmentImportUploader onImportComplete={setImportResult} />
            {importResult && (
              <div className="mt-3 text-xs text-muted-foreground">
                ✓ Import ready. Next: Build Draft Products
              </div>
            )}
          </div>

          {/* Step 2: Build */}
          <div className="bg-white border-l-4 border-primary rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">2</div>
              <h3 className="text-base font-bold">Build Draft Products</h3>
            </div>
            <DraftProductBuilder onBuildComplete={setBuildResult} />
            {buildResult && (
              <div className="mt-3 text-xs text-muted-foreground">
                ✓ {buildResult.products_built || 0} draft products built. Next: Run QA
              </div>
            )}
          </div>

          {/* Step 3: QA */}
          <div className="bg-white border-l-4 border-primary rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">3</div>
              <h3 className="text-base font-bold">Run Product QA</h3>
            </div>
            <ProductQARunner onQAComplete={setQAResult} />
            {qaResult && (
              <div className="mt-3 space-y-2">
                <div className="text-xs text-muted-foreground">
                  ✓ {qaResult.passed || 0} passed, {qaResult.failed || 0} issues
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Link to="/AdminGarmentCatalog">
                    <Button size="sm" variant="outline">View Draft Products</Button>
                  </Link>
                  <Link to="/PublicCatalogAudit">
                    <Button size="sm" variant="outline">View Public Products</Button>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Step 3b: Repair Images */}
          <div className="bg-white border-l-4 border-primary rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">3b</div>
              <h3 className="text-base font-bold">Repair Missing Images (Optional)</h3>
            </div>
            <RepairDraftImages onRepairComplete={() => {}} />
          </div>

          {/* Step 4: Approve */}
          <div className="bg-white border-l-4 border-accent rounded-lg p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-bold">4</div>
              <h3 className="text-base font-bold">Approve & Publish</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Select draft products that passed QA and publish them to the public shop.
            </p>
            <ApproveDraftProducts onApprovalComplete={() => {}} />
          </div>
        </div>

        {/* Safety Notes */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-900 mb-2">Safety Rules</p>
              <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                <li>All imported products start as Draft/Hidden</li>
                <li>Products must pass QA before approval</li>
                <li>Only you can publish products publicly</li>
                <li>Failed QA products stay hidden</li>
                <li>Never delete existing products</li>
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}