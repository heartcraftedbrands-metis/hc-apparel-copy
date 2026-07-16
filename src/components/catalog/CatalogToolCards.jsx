import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Zap } from 'lucide-react';

export default function CatalogToolCards({
  counts,
  classifying, classifyProgress, autoClassify,
  backfilling, backfillProgress, backfillSummary, backfillLanes,
  repairingInv, repairInvProgress, repairInvSummary, repairInventory,
  onRefreshCounts,
}) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Auto-classify */}
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-purple-900">
            <Zap className="w-4 h-4" /> Auto-Classify Pending
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-purple-800">
            Classify <strong>{counts.pending.toLocaleString()}</strong> pending rows. Does <strong>not</strong> approve or publish.
          </p>
          {classifyProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-purple-800">
                <span>Classifying…</span><span>{classifyProgress.done} / {classifyProgress.total}</span>
              </div>
              <div className="w-full bg-purple-200 rounded-full h-2">
                <div className="bg-purple-600 h-2 rounded-full transition-all"
                  style={{ width: `${(classifyProgress.done / Math.max(classifyProgress.total, 1)) * 100}%` }} />
              </div>
            </div>
          )}
          <Button onClick={autoClassify} disabled={classifying || counts.pending === 0}
            className="bg-purple-700 hover:bg-purple-800 text-white gap-2 w-full text-xs">
            {classifying
              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Classifying…</>
              : <><Zap className="w-3.5 h-3.5" /> Classify {counts.pending.toLocaleString()} Pending</>}
          </Button>
        </CardContent>
      </Card>

      {/* Backfill */}
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-orange-900">
            <RefreshCw className="w-4 h-4" /> Backfill / Normalize Lanes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-orange-800">
            Scan <strong>all {counts.total.toLocaleString()}</strong> rows and normalize <code className="bg-orange-100 px-1 rounded">product_lane</code>.
          </p>
          {backfillProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-orange-800">
                <span>Backfilling…</span><span>{backfillProgress.done} / {backfillProgress.total}</span>
              </div>
              <div className="w-full bg-orange-200 rounded-full h-2">
                <div className="bg-orange-500 h-2 rounded-full transition-all"
                  style={{ width: `${(backfillProgress.done / Math.max(backfillProgress.total, 1)) * 100}%` }} />
              </div>
            </div>
          )}
          <Button onClick={backfillLanes} disabled={backfilling}
            className="bg-orange-600 hover:bg-orange-700 text-white gap-2 w-full text-xs">
            {backfilling
              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Backfilling…</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Backfill / Normalize All Lanes</>}
          </Button>
          {backfillSummary && (
            <div className="bg-orange-100 border border-orange-300 rounded-lg p-2 text-xs text-orange-900 space-y-0.5 font-mono">
              <p className="font-semibold text-orange-800 mb-1">Backfill Summary</p>
              <p>Rows scanned: <strong>{backfillSummary.totalScanned.toLocaleString()}</strong></p>
              <p>With product_lane: <strong>{backfillSummary.withLane.toLocaleString()}</strong></p>
              <p>Inventory &gt; 0: <strong className={backfillSummary.withInvGt0 > 0 ? 'text-green-700' : 'text-red-700'}>{backfillSummary.withInvGt0.toLocaleString()}</strong></p>
              <p>Cost &lt; $8: <strong>{backfillSummary.withCostLt8.toLocaleString()}</strong></p>
              <p className="text-green-800 font-bold">⭐ Starter Cotton: {backfillSummary.starterCottonMatch.toLocaleString()}</p>
              <p className="text-blue-800 font-bold">⭐ Starter Sports: {backfillSummary.starterSportsMatch.toLocaleString()}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repair Inventory */}
      <Card className="border-teal-200 bg-teal-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-teal-900">
            <RefreshCw className="w-4 h-4" /> Repair / Normalize Inventory
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-teal-800">
            Reads <code className="bg-teal-100 px-1 rounded">Inventory Qty</code>, stock, qty and writes normalized <code className="bg-teal-100 px-1 rounded">inventory_qty</code>.
          </p>
          {repairInvProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-teal-800">
                <span>Repairing…</span><span>{repairInvProgress.done} / {repairInvProgress.total}</span>
              </div>
              <div className="w-full bg-teal-200 rounded-full h-2">
                <div className="bg-teal-600 h-2 rounded-full transition-all"
                  style={{ width: `${(repairInvProgress.done / Math.max(repairInvProgress.total, 1)) * 100}%` }} />
              </div>
            </div>
          )}
          <Button onClick={repairInventory} disabled={repairingInv}
            className="bg-teal-600 hover:bg-teal-700 text-white gap-2 w-full text-xs">
            {repairingInv
              ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Repairing…</>
              : <><RefreshCw className="w-3.5 h-3.5" /> Repair / Normalize Inventory</>}
          </Button>
          {repairInvSummary && (
            <div className="bg-teal-100 border border-teal-300 rounded-lg p-2 text-xs text-teal-900 space-y-0.5 font-mono">
              <p className="font-semibold text-teal-800 mb-1">Inventory Repair Summary</p>
              <p>Rows scanned: <strong>{repairInvSummary.totalScanned.toLocaleString()}</strong></p>
              <p>Rows repaired: <strong className="text-teal-700">{repairInvSummary.rowsRepaired.toLocaleString()}</strong></p>
              <p>Inventory &gt; 0: <strong className="text-green-700">{repairInvSummary.invGt0.toLocaleString()}</strong></p>
              <p>Still inventory = 0: <strong className="text-red-700">{repairInvSummary.inv0.toLocaleString()}</strong></p>
              <p>Deleted rows: <strong className="text-green-700">0</strong></p>
              <p className="text-green-800 font-bold">⭐ Starter Cotton: {repairInvSummary.starterCottonMatch.toLocaleString()}</p>
              <p className="text-blue-800 font-bold">⭐ Starter Sports: {repairInvSummary.starterSportsMatch.toLocaleString()}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workflow */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-green-900">⭐ Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <ol className="text-xs text-green-900 space-y-1 list-decimal list-inside">
            <li>Set status filter to <strong>Pending Review</strong></li>
            <li>Click <strong>Starter Cotton Set</strong> or <strong>Pending In Stock Under $8</strong></li>
            <li>Click <strong>Select Visible Page</strong></li>
            <li>Click <strong>Approve Visible In-Stock Only</strong></li>
            <li>Click <strong>Refresh Review Counts</strong></li>
          </ol>
          <p className="text-xs text-green-800 font-semibold">Nothing is published. No draft products created.</p>
          <Button size="sm" onClick={onRefreshCounts}
            className="bg-green-700 hover:bg-green-800 text-white gap-1 w-full text-xs mt-1">
            <RefreshCw className="w-3 h-3" /> Refresh Review Counts
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}