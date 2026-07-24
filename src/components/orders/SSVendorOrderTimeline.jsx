import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Clock3 } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import {
  SS_VENDOR_ORDER_STAGES,
  SS_VENDOR_ORDER_STAGE_MAP,
} from '@/lib/ssVendorOrderWorkflow';

export default function SSVendorOrderTimeline({ currentStatus, draftId, quoteRequestId }) {
  const currentIndex = SS_VENDOR_ORDER_STAGE_MAP[currentStatus]?.index ?? 0;
  const { data: history = [] } = useQuery({
    queryKey: ['ss-vendor-order-history', draftId, quoteRequestId],
    queryFn: async () => {
      let query = supabase
        .from('vendor_order_status_history')
        .select('*')
        .order('changed_at', { ascending: true });
      if (draftId && quoteRequestId) {
        query = query.or(`draft_id.eq.${draftId},quote_request_id.eq.${quoteRequestId}`);
      } else if (draftId) {
        query = query.eq('draft_id', draftId);
      } else {
        query = query.eq('quote_request_id', quoteRequestId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(draftId || quoteRequestId),
  });

  const latestByStatus = new Map();
  history.forEach((entry) => latestByStatus.set(entry.to_status, entry));

  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {SS_VENDOR_ORDER_STAGES.map((stage, index) => {
        const entry = latestByStatus.get(stage.value);
        const complete = index < currentIndex;
        const current = index === currentIndex;
        return (
          <div
            key={stage.value}
            className={`rounded-xl border px-3 py-2 flex gap-2 ${
              current
                ? 'border-primary bg-primary/5'
                : complete
                  ? 'border-green-200 bg-green-50'
                  : 'border-border bg-muted/10'
            }`}
          >
            {complete ? (
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
            ) : current ? (
              <Clock3 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground/40 mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold">{index + 1}. {stage.label}</p>
              {entry?.changed_at && (
                <p className="text-[11px] text-muted-foreground">
                  {new Date(entry.changed_at).toLocaleString()}
                </p>
              )}
              {entry?.admin_note && (
                <p className="text-[11px] text-muted-foreground truncate">{entry.admin_note}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
