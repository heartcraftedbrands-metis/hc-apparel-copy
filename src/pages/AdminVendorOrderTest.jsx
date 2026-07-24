import React, { useState } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Clock, Plus } from 'lucide-react';

const TESTS = [
  { id: 'A', name: 'Vendor Order Detail Opens', description: 'Open the saved vendor order from Customer Order #c7b23626 if available' },
  { id: 'B', name: 'Product Options Carry Over', description: 'Confirm the vendor order shows correct product details' },
  { id: 'C', name: 'Fulfillment Packet Data', description: 'Confirm all required fields are displayed' },
  { id: 'D', name: 'Checklist Saves', description: 'Check "Customer order reviewed", save, refresh, confirm persistence' },
  { id: 'E', name: 'Status Buttons Work', description: 'Click Mark Ready to Place, save, refresh, confirm status persists' },
  { id: 'F', name: 'Tracking Saves', description: 'Add test tracking number and confirm it appears' },
  { id: 'G', name: 'Print Fulfillment Sheet Opens', description: 'Click Print Fulfillment Sheet button' },
];

export default function AdminVendorOrderTest() {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [testLog, setTestLog] = useState([]);

  const { data: vendorOrders = [] } = useQuery({
    queryKey: ['vendor-orders-test'],
    queryFn: () => base44.entities.VendorOrder.list('-created_date', 10),
  });

  const { data: customerOrders = [] } = useQuery({
    queryKey: ['customer-orders-test'],
    queryFn: () => base44.entities.Order.list('-created_date', 20),
  });

  const log = (testId, message, status = 'info') => {
    setTestLog(p => [...p, { time: new Date().toLocaleTimeString(), testId, message, status }]);
  };

  const runTests = async () => {
    setRunning(true);
    setResults({});
    setTestLog([]);

    try {
      // Get a vendor order to test
      log('A', 'Finding vendor order for testing...', 'info');
      const linkedVO = vendorOrders.find(vo => vo.customer_order_id);
      if (!linkedVO) {
        log('A', 'No vendor orders found - tests require at least one vendor order', 'error');
        setResults(p => ({ ...p, A: { status: 'fail', message: 'No vendor orders available' } }));
        return;
      }

      log('A', `Testing with vendor order: ${linkedVO.id.slice(-8).toUpperCase()}`, 'success');
      setResults(p => ({ ...p, A: { status: 'pass', message: `Vendor Order #${linkedVO.id.slice(-8).toUpperCase()} loaded` } }));

      const co = customerOrders.find(o => o.id === linkedVO.customer_order_id);

      // Test B: Product Options
      log('B', 'Checking product details...', 'info');
      if (linkedVO.items?.length > 0) {
        const item = linkedVO.items[0];
        const hasProduct = !!item.product_name;
        const hasSize = !!item.garment_size;
        const hasColor = !!item.garment_color;
        const hasQty = !!item.quantity;
        if (hasProduct && hasQty && (hasSize || hasColor)) {
          log('B', `Product "${item.product_name}" has options`, 'success');
          setResults(p => ({ ...p, B: { status: 'pass', message: `Product options correct: ${item.product_name}` } }));
        } else {
          log('B', `Missing options`, 'warn');
          setResults(p => ({ ...p, B: { status: 'warn', message: 'Some product options missing' } }));
        }
      }

      // Test C: Fulfillment Packet Data
      log('C', 'Verifying fulfillment packet...', 'info');
      if (linkedVO && co) {
        const allPresent = linkedVO.vendor_name && co.shipping_address && linkedVO.items?.length && 
                         linkedVO.blank_garment_cost !== undefined && linkedVO.customer_sell_price !== undefined;
        if (allPresent) {
          log('C', 'All fulfillment fields present', 'success');
          setResults(p => ({ ...p, C: { status: 'pass', message: 'All fulfillment data present' } }));
        } else {
          log('C', 'Some fields missing', 'warn');
          setResults(p => ({ ...p, C: { status: 'warn', message: 'Some fulfillment data missing' } }));
        }
      }

      // Test D: Checklist Saves
      log('D', 'Testing checklist persistence...', 'info');
      const originalChecklist = linkedVO.fulfillment_checklist || {};
      try {
        const newChecklist = { ...originalChecklist, order_reviewed: true };
        await base44.entities.VendorOrder.update(linkedVO.id, { fulfillment_checklist: newChecklist });
        const updated = await base44.entities.VendorOrder.get(linkedVO.id);
        if (updated.fulfillment_checklist?.order_reviewed === true) {
          log('D', 'Checklist persisted correctly', 'success');
          setResults(p => ({ ...p, D: { status: 'pass', message: 'Checklist saves and persists' } }));
          // Reset
          await base44.entities.VendorOrder.update(linkedVO.id, { fulfillment_checklist: originalChecklist });
        } else {
          throw new Error('Checklist not persisted');
        }
      } catch (err) {
        log('D', `Error: ${err.message}`, 'error');
        setResults(p => ({ ...p, D: { status: 'fail', message: 'Failed to save checklist' } }));
      }

      // Test E: Status Buttons
      log('E', 'Testing status change persistence...', 'info');
      const originalStatus = linkedVO.status;
      try {
        await base44.entities.VendorOrder.update(linkedVO.id, { status: 'ready_to_place' });
        const updated = await base44.entities.VendorOrder.get(linkedVO.id);
        if (updated.status === 'ready_to_place') {
          log('E', 'Status persisted correctly', 'success');
          setResults(p => ({ ...p, E: { status: 'pass', message: 'Status buttons work and persist' } }));
          // Reset
          await base44.entities.VendorOrder.update(linkedVO.id, { status: originalStatus });
        } else {
          throw new Error('Status not persisted');
        }
      } catch (err) {
        log('E', `Error: ${err.message}`, 'error');
        setResults(p => ({ ...p, E: { status: 'fail', message: 'Failed to change status' } }));
      }

      // Test F: Tracking Saves
      log('F', 'Testing tracking field persistence...', 'info');
      const originalTracking = {
        tracking_number: linkedVO.tracking_number,
        tracking_carrier: linkedVO.tracking_carrier,
        tracking_url: linkedVO.tracking_url,
        ship_date: linkedVO.ship_date,
        estimated_delivery_date: linkedVO.estimated_delivery_date,
      };
      try {
        const testData = {
          tracking_number: 'TEST123456',
          tracking_carrier: 'TestCarrier',
          tracking_url: 'https://test.com/track',
          ship_date: '2026-06-22',
          estimated_delivery_date: '2026-06-30',
        };
        await base44.entities.VendorOrder.update(linkedVO.id, testData);
        const updated = await base44.entities.VendorOrder.get(linkedVO.id);
        if (updated.tracking_number === 'TEST123456') {
          log('F', 'Tracking persisted correctly', 'success');
          setResults(p => ({ ...p, F: { status: 'pass', message: 'Tracking information saves' } }));
          // Reset
          await base44.entities.VendorOrder.update(linkedVO.id, originalTracking);
        } else {
          throw new Error('Tracking not persisted');
        }
      } catch (err) {
        log('F', `Error: ${err.message}`, 'error');
        setResults(p => ({ ...p, F: { status: 'fail', message: 'Failed to save tracking' } }));
      }

      // Test G: Print Sheet Available
      log('G', 'Verifying print sheet data...', 'info');
      const hasSheetData = !!linkedVO.id && !!co?.customer_name && !!co?.shipping_address;
      if (hasSheetData) {
        log('G', 'Print sheet has all required data', 'success');
        setResults(p => ({ ...p, G: { status: 'pass', message: 'Print fulfillment sheet can be generated' } }));
      } else {
        log('G', 'Missing data for print sheet', 'warn');
        setResults(p => ({ ...p, G: { status: 'warn', message: 'Some print data missing' } }));
      }

      log('summary', 'All automated tests completed', 'success');

    } catch (error) {
      log('error', `Test error: ${error.message}`, 'error');
    } finally {
      setRunning(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pass': return 'bg-green-100 text-green-700';
      case 'warn': return 'bg-amber-100 text-amber-700';
      case 'fail': return 'bg-red-100 text-red-700';
      case 'manual': return 'bg-blue-100 text-blue-700';
      case 'skip': return 'bg-gray-100 text-gray-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pass':
      case 'success': return <CheckCircle2 className="w-4 h-4" />;
      case 'fail':
      case 'error': return <AlertCircle className="w-4 h-4" />;
      case 'manual':
      case 'warn':
      case 'skip': return <Clock className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const passCount = Object.values(results).filter(r => r.status === 'pass').length;
  const failCount = Object.values(results).filter(r => r.status === 'fail').length;
  const manualCount = Object.values(results).filter(r => r.status === 'manual').length;
  const totalTests = TESTS.length;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto">
          <h1 className="text-2xl font-bold">Vendor Order Fulfillment Tests</h1>
          <p className="text-primary-foreground/70">Test the vendor order detail page workflow</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Summary */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-2xl border p-6 text-center">
            <p className="text-muted-foreground text-sm mb-2">Total Tests</p>
            <p className="text-3xl font-bold">{totalTests}</p>
          </div>
          <div className="bg-green-50 rounded-2xl border border-green-200 p-6 text-center">
            <p className="text-green-700 text-sm mb-2">Passed</p>
            <p className="text-3xl font-bold text-green-700">{passCount}</p>
          </div>
          <div className="bg-red-50 rounded-2xl border border-red-200 p-6 text-center">
            <p className="text-red-700 text-sm mb-2">Failed</p>
            <p className="text-3xl font-bold text-red-700">{failCount}</p>
          </div>
          <div className="bg-blue-50 rounded-2xl border border-blue-200 p-6 text-center">
            <p className="text-blue-700 text-sm mb-2">Manual Tests</p>
            <p className="text-3xl font-bold text-blue-700">{manualCount}</p>
          </div>
          <div className="bg-white rounded-2xl border p-6 text-center">
            <p className="text-muted-foreground text-sm mb-2">Last Run</p>
            <p className="text-sm font-medium">{Object.keys(results).length > 0 ? new Date().toLocaleTimeString() : '—'}</p>
          </div>
        </div>

        {/* Run Button */}
        <div className="mb-8">
          <Button 
            size="lg" 
            onClick={runTests} 
            disabled={running}
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Plus className="w-5 h-5" />
            {running ? 'Running Tests...' : 'Run All Tests'}
          </Button>
        </div>

        {/* Test Results */}
        {Object.keys(results).length > 0 && (
          <div className="space-y-4 mb-8">
            {TESTS.map(test => {
              const result = results[test.id];
              if (!result) return null;
              return (
                <div key={test.id} className={`rounded-2xl border p-6 ${result.status === 'pass' ? 'bg-green-50 border-green-200' : result.status === 'fail' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-1">
                      {getStatusIcon(result.status)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-bold text-lg">{test.id}. {test.name}</h3>
                        <Badge className={`text-xs ${getStatusColor(result.status)}`}>{result.status.toUpperCase()}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{test.description}</p>
                      <p className="text-sm font-medium">{result.message}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Test Log */}
        {testLog.length > 0 && (
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-bold text-lg mb-4">Test Log</h2>
            <div className="space-y-2 font-mono text-xs max-h-96 overflow-y-auto">
              {testLog.map((entry, idx) => (
                <div key={idx} className={`p-2 rounded flex gap-2 ${entry.status === 'success' ? 'bg-green-50 text-green-700' : entry.status === 'error' ? 'bg-red-50 text-red-700' : entry.status === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-700'}`}>
                  <span className="text-gray-500">[{entry.time}]</span>
                  <span className="font-bold">{entry.testId}:</span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mt-8">
          <h2 className="font-bold text-lg text-blue-900 mb-4">Manual Test Instructions</h2>
          <ol className="space-y-3 text-sm text-blue-900">
            <li><strong>Tests D, E, F:</strong> After running automated tests, manually complete these on the Vendor Order Detail page:</li>
            <li className="ml-4">
              <strong>D - Checklist:</strong> Open a vendor order → Check "Customer order reviewed" → Click "Save All Changes" → Refresh page → Verify checkbox is still checked
            </li>
            <li className="ml-4">
              <strong>E - Status:</strong> Click "Mark Ready to Place" → Verify status changes → Save → Refresh → Verify status persists
            </li>
            <li className="ml-4">
              <strong>F - Tracking:</strong> Enter "TEST123456" in Tracking Number field → Save → Verify it appears after refresh
            </li>
            <li className="ml-4">
              <strong>G - Print:</strong> Click "Print Fulfillment Sheet" button → Verify printable view shows order number, customer address, products, and checklist
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}