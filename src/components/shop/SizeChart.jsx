import React from 'react';
import { Ruler } from 'lucide-react';

const SIZE_CHARTS = {
  '64000': {
    label: 'Gildan 64000 — Softstyle T-Shirt',
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
    rows: [
      { label: 'Body Length', values: ['28', '29', '30', '31', '32', '33'] },
      { label: 'Chest Width (Laid Flat)', values: ['18', '20', '22', '24', '26', '28'] },
    ],
  },
  '6110': {
    label: "BELLA + CANVAS 6110 — Women's Heavyweight Tee",
    sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
    rows: [
      { label: 'Body Length', values: ['22 ¼', '22 ½', '23 ½', '24 ½', '25 ½', '26 ½', '27 ½'] },
      { label: 'Chest Width (Laid Flat)', values: ['18 ¼', '19', '20 ½', '22 ½', '24 ½', '26 ½', '28 ½'] },
    ],
  },
  '3010': {
    label: 'BELLA + CANVAS 3010Y — Youth Heavyweight Tee',
    sizes: ['S', 'M', 'L', 'XL'],
    rows: [
      { label: 'Chest Width (Laid Flat)', values: ['16 ⅛', '17 ⅛', '18 ⅛', '19 ⅛'] },
      { label: 'Sleeve Length', values: ['6', '6 ½', '7', '7 ½'] },
    ],
  },
  '5180': {
    label: 'Hanes 5180 / 5180R — Beefy-T',
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
    rows: [
      { label: 'Body Length', values: ['28', '29', '30', '31', '32', '33'] },
      { label: 'Chest Width (Laid Flat)', values: ['18', '20', '22', '24', '26', '28'] },
    ],
  },
  '299': {
    label: 'Tultex 299 — Unisex Heavyweight Tee',
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
    rows: [
      { label: 'Body Length', values: ['28', '29 ½', '31', '32', '33', '34'] },
      { label: 'Chest Width (Laid Flat)', values: ['18', '20', '22', '24', '26', '28'] },
    ],
  },
};

function getChartKey(productName) {
  if (!productName) return null;
  if (productName.includes('64000')) return '64000';
  if (productName.includes('6110')) return '6110';
  if (productName.includes('3010')) return '3010';
  if (productName.includes('5180')) return '5180';
  if (productName.includes('299')) return '299';
  return null;
}

export default function SizeChart({ productName }) {
  const key = getChartKey(productName);
  if (!key) return null;
  const chart = SIZE_CHARTS[key];

  return (
    <div className="border rounded-lg overflow-hidden w-full">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b">
        <Ruler className="w-4 h-4 text-gray-600" />
        <span className="text-sm font-semibold text-gray-700">Size Chart</span>
        <span className="text-xs text-gray-400 ml-1">(measurements in inches)</span>
      </div>
      <div className="overflow-x-auto">
        <p className="text-xs text-gray-500 px-4 pt-3 pb-1">{chart.label}</p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left px-3 py-2 border border-gray-200 font-medium text-gray-700">Measurement</th>
              {chart.sizes.map(s => (
                <th key={s} className="px-3 py-2 border border-gray-200 font-medium text-gray-700 text-center">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium whitespace-nowrap">{row.label}</td>
                {row.values.map((v, j) => (
                  <td key={j} className="px-3 py-2 border border-gray-200 text-center text-gray-700">{v}"</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}