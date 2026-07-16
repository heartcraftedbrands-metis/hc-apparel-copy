import React from 'react';
import MarginBadge, { getMarginStatus } from './MarginBadge';

export default function ProfitSummaryCard({ revenue, cost, profit, margin, perItem, qty }) {
  const status = getMarginStatus(margin);
  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h3 className="font-bold text-sm">Profit Summary</h3>
        <MarginBadge margin={margin} size="sm" />
      </div>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Customer Paid', value: revenue, color: 'text-primary' },
            { label: 'Total Cost',    value: cost,    color: 'text-red-600' },
            { label: 'Est. Profit',   value: profit,  color: profit >= 0 ? 'text-green-700' : 'text-red-700' },
            { label: 'Per Item',      value: perItem, color: 'text-foreground' },
          ].map(r => (
            <div key={r.label} className="bg-muted/30 rounded-xl p-3 text-center">
              <div className={`font-bold text-base ${r.color}`}>${Number(r.value||0).toFixed(2)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{r.label}</div>
            </div>
          ))}
        </div>

        {/* Margin bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">Margin</span>
            <span className="text-sm font-bold">{Number(margin||0).toFixed(1)}%</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${status.bar}`}
              style={{ width: `${Math.min(Math.max(margin, 0), 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0%</span><span className="text-yellow-600">20%</span><span className="text-yellow-600">35%</span><span>100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}