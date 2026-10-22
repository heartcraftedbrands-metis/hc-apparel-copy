import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DTF_PRICING_ORDER_TYPES,
  DTF_TIERS,
  formatDtfQuantityTier,
  getDtfRetailPricingChart,
} from '@/lib/dtfTransfers';

const money = value => `$${Number(value).toFixed(2)}`;

export default function DtfPriceChart() {
  const [open, setOpen] = useState(false);
  const [orderType, setOrderType] = useState(DTF_PRICING_ORDER_TYPES[0].id);
  const selectedType = DTF_PRICING_ORDER_TYPES.find(type => type.id === orderType) || DTF_PRICING_ORDER_TYPES[0];
  const rows = useMemo(() => getDtfRetailPricingChart(selectedType.precut), [selectedType.precut]);

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-[#c9b782] bg-[#fffdf7] shadow-sm" aria-labelledby="dtf-all-prices-heading">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-[#f7f1e5] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#c6922f]/45 sm:p-7"
        aria-expanded={open}
        aria-controls="dtf-all-prices-panel"
        onClick={() => setOpen(current => !current)}
      >
        <span>
          <span className="block text-xs font-black uppercase tracking-[.18em] text-[#a36f12]">Approved retail pricing</span>
          <span id="dtf-all-prices-heading" className="mt-1 block text-xl font-black text-[#173f31] sm:text-2xl">{open ? 'Hide Prices' : 'View All Prices'}</span>
          <span className="mt-1 block text-sm text-[#5f665c]">Compare every supported size and quantity tier before ordering.</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 rounded-full border border-[#c6922f]/40 bg-[#f7f1e5] px-3 py-2 text-sm font-bold text-[#173f31]">
          <span className="hidden sm:inline">{open ? 'Hide Prices' : 'View All Prices'}</span>
          <ChevronDown aria-hidden="true" className={`h-5 w-5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div id="dtf-all-prices-panel" className="border-t border-[#d8cda9] p-4 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-bold text-[#173f31]">Choose an order type</p>
              <div className="mt-2 inline-flex max-w-full rounded-xl border border-[#c9b782] bg-[#f7f1e5] p-1" role="tablist" aria-label="DTF pricing order type">
                {DTF_PRICING_ORDER_TYPES.map(type => (
                  <button
                    key={type.id}
                    type="button"
                    role="tab"
                    aria-selected={orderType === type.id}
                    aria-controls="dtf-pricing-table"
                    className={`min-h-10 rounded-lg px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c6922f] ${orderType === type.id ? 'bg-[#365225] text-white shadow-sm' : 'text-[#365225] hover:bg-white'}`}
                    onClick={() => setOrderType(type.id)}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-[#5f665c]">
              Customer retail price per transfer. Quantity discounts apply automatically to the total number of transfers in the selected tier.
            </p>
          </div>

          <div className="mt-5 max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-[#c9b782] bg-white" tabIndex="0" aria-label={`${selectedType.label} retail pricing table. Scroll horizontally on small screens.`}>
            <table id="dtf-pricing-table" className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">{selectedType.label}: approved retail price per transfer by size and quantity.</caption>
              <thead>
                <tr className="bg-[#173f31] text-left text-[#fff8e9]">
                  <th scope="col" className="sticky left-0 z-10 min-w-36 border-r border-white/20 bg-[#173f31] px-4 py-3 font-black">Transfer size</th>
                  {DTF_TIERS.map(tier => (
                    <th scope="col" key={tier.min} className="min-w-28 px-4 py-3 text-center font-black">
                      <span className="block">{formatDtfQuantityTier(tier)}</span>
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-[#f5d77b]">transfers</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.size} className={rowIndex % 2 === 0 ? 'bg-[#fffdf7]' : 'bg-[#f7f1e5]'}>
                    <th scope="row" className={`sticky left-0 z-[1] border-r border-[#ded4b6] px-4 py-3 text-left font-black text-[#173f31] ${rowIndex % 2 === 0 ? 'bg-[#fffdf7]' : 'bg-[#f7f1e5]'}`}>
                      {row.size} in
                    </th>
                    {row.prices.map((price, index) => (
                      <td key={DTF_TIERS[index].min} className="border-t border-[#e7dfc8] px-4 py-3 text-center font-bold tabular-nums text-[#2f3b2a]">
                        {money(price)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#d8cda9] bg-[#f7f1e5] p-4">
              <p className="font-black text-[#173f31]">Shipping</p>
              <p className="mt-1 text-sm text-[#5f665c]">Calculated separately after the shipping address and freight are verified.</p>
            </div>
            <div className="rounded-xl border border-[#d8cda9] bg-[#f7f1e5] p-4">
              <p className="font-black text-[#173f31]">Tax</p>
              <p className="mt-1 text-sm text-[#5f665c]">Calculated separately at checkout when applicable. It is not included in the transfer prices above.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
