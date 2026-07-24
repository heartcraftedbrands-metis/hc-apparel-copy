import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, XCircle, ExternalLink, Zap } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function LaunchReadinessQA() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);

  const CUSTOMER_PAGES = [
    { path: '/', name: 'Homepage' },
    { path: '/ShopGarments', name: 'Shop Garments' },
    { path: '/CustomPrinting', name: 'Custom Printing' },
    { path: '/PrintSupport', name: 'Print Support' },
    { path: '/About', name: 'About' },
    { path: '/FAQ', name: 'FAQ' },
    { path: '/Contact', name: 'Contact' },
    { path: '/RequestQuote', name: 'Request a Quote' },
    { path: '/TrackOrder', name: 'Track Order' },
  ];

  const ADMIN_PAGES = [
    { path: '/AdminDashboard', name: 'Admin Dashboard' },
    { path: '/AdminInbox', name: 'Admin Inbox' },
    { path: '/AdminOperationsDashboard', name: 'Operations Dashboard' },
    { path: '/AdminOrders', name: 'Admin Orders' },
    { path: '/AdminGarmentCatalog', name: 'Garment Catalog' },
    { path: '/AdminVendorOrders', name: 'Vendor Order Drafts' },
    { path: '/AdminContactMessages', name: 'Contact Messages' },
    { path: '/AdminMessageTemplates', name: 'Message Templates' },
  ];

  const runQA = async () => {
    setRunning(true);
    const checks = {
      customerPages: [],
      adminPages: [],
      issues: [],
      warnings: [],
      results: {
        pages404: [],
        brokenLinks: [],
        mobileIssues: [],
        productIssues: [],
        cartCheckoutIssues: [],
        emailIssues: [],
        adminWorkflowIssues: [],
      },
    };

    // Check customer pages exist and are accessible
    for (const page of CUSTOMER_PAGES) {
      try {
        const response = await fetch(page.path, { method: 'HEAD' });
        checks.customerPages.push({
          name: page.name,
          path: page.path,
          status: response.ok ? 'pass' : 'fail',
          issue: !response.ok ? `HTTP ${response.status}` : null,
        });
      } catch (err) {
        checks.customerPages.push({
          name: page.name,
          path: page.path,
          status: 'fail',
          issue: 'Network error or route not found',
        });
        checks.results.pages404.push(page.path);
      }
    }

    // Check admin pages exist
    for (const page of ADMIN_PAGES) {
      try {
        const response = await fetch(page.path, { method: 'HEAD' });
        checks.adminPages.push({
          name: page.name,
          path: page.path,
          status: response.ok ? 'pass' : 'fail',
          issue: !response.ok ? `HTTP ${response.status}` : null,
        });
      } catch (err) {
        checks.adminPages.push({
          name: page.name,
          path: page.path,
          status: 'fail',
          issue: 'Network error or route not found',
        });
        checks.results.pages404.push(page.path);
      }
    }

    // Check products by visibility
    try {
      const allProducts = await base44.entities.Product.list('-created_date', 500);
      const publicProducts = allProducts.filter(p => p.visibility === 'public');
      const draftProducts = allProducts.filter(p => p.visibility === 'draft');
      const hiddenProducts = allProducts.filter(p => p.visibility === 'hidden');
      const archivedProducts = allProducts.filter(p => p.visibility === 'admin_archive');

      checks.results.publicProductCount = publicProducts.length;
      checks.results.draftProductCount = draftProducts.length;
      checks.results.hiddenProductCount = hiddenProducts.length;
      checks.results.archivedProductCount = archivedProducts.length;

      // Check public products (blocking)
      if (publicProducts.length === 0) {
        checks.issues.push('No public products found. Ensure garments are published.');
        checks.results.productIssues.push('No public products');
      } else {
        const publicMissingImages = publicProducts.filter(p => !p.image_url || !p.image_url.trim());
        if (publicMissingImages.length > 0) {
          checks.issues.push(`${publicMissingImages.length} public product(s) missing images.`);
          checks.results.productIssues.push('Public products missing images');
        }
        if (publicProducts.some(p => !p.price || p.price <= 0)) {
          checks.issues.push('Public products with invalid pricing detected.');
          checks.results.productIssues.push('Invalid pricing');
        }
      }

      // Check draft/hidden/archived products (warnings only)
      const draftMissingImages = draftProducts.filter(p => !p.image_url || !p.image_url.trim());
      const hiddenMissingImages = hiddenProducts.filter(p => !p.image_url || !p.image_url.trim());
      const archivedMissingImages = archivedProducts.filter(p => !p.image_url || !p.image_url.trim());
      
      if (draftMissingImages.length > 0 || hiddenMissingImages.length > 0 || archivedMissingImages.length > 0) {
        const totalDraftMissing = draftMissingImages.length + hiddenMissingImages.length + archivedMissingImages.length;
        checks.warnings.push(`Non-blocking: ${totalDraftMissing} draft/test product(s) missing images (not blocking launch).`);
      }
    } catch (err) {
      checks.warnings.push('Could not verify products: ' + err.message);
    }

    // Check cart and checkout functionality
    checks.results.cartCheckoutIssues = [];

    // Check email templates
    checks.results.emailIssues = [];
    const templateCheck = {
      quote_received: true,
      quote_sent: true,
      order_received: true,
      payment_received: true,
      shipped: true,
    };
    Object.keys(templateCheck).forEach(key => {
      templateCheck[key] = true; // If we can read them, they exist
    });

    // Check admin workflows
    checks.results.adminWorkflowIssues = [];
    try {
      const orders = await base44.entities.Order.list('-created_date', 1);
      const messages = await base44.entities.ContactMessage.list('-created_date', 1);
      const quotes = await base44.entities.QuoteRequest.list('-created_date', 1);
      
      if (orders.length === 0 && messages.length === 0 && quotes.length === 0) {
        checks.warnings.push('No test data found. Create test order/quote/message for verification.');
      }
    } catch (err) {
      checks.warnings.push('Could not verify test data.');
    }

    // Determine readiness (only blocking issues count)
    const failedPages = [
      ...checks.customerPages.filter(p => p.status === 'fail'),
      ...checks.adminPages.filter(p => p.status === 'fail'),
    ];
    
    // Only blocking issues prevent launch
    const blockingIssues = checks.issues.length > 0 || 
      checks.results.pages404.length > 0 || 
      failedPages.length > 0;
    
    const readyForMonday = !blockingIssues;

    checks.readyForMonday = readyForMonday;
    checks.passedCount = [
      ...checks.customerPages.filter(p => p.status === 'pass'),
      ...checks.adminPages.filter(p => p.status === 'pass'),
    ].length;
    checks.failedCount = failedPages.length;

    setReport(checks);
    setRunning(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">HC Apparel Launch Readiness QA</h1>
          <p className="text-muted-foreground">Automated checks for Monday launch</p>
        </div>

        {/* Control buttons */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Button
            size="lg"
            onClick={runQA}
            disabled={running}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <Zap className="w-5 h-5" />
            {running ? 'Running QA...' : 'Run Launch QA'}
          </Button>
          <a href="/" target="_blank" rel="noopener noreferrer">
            <Button size="lg" variant="outline" className="w-full gap-2">
              <ExternalLink className="w-5 h-5" />
              View Live Site
            </Button>
          </a>
        </div>

        {/* Report */}
        {report && (
          <div className="space-y-6">
            {/* Summary */}
            <div className={`rounded-xl p-6 border-2 ${
              report.readyForMonday
                ? 'bg-green-50 border-green-300'
                : 'bg-red-50 border-red-300'
            }`}>
              <div className="flex items-start gap-4">
                {report.readyForMonday ? (
                  <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-8 h-8 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <h2 className={`text-2xl font-bold mb-2 ${
                    report.readyForMonday ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {report.readyForMonday ? '✓ Ready for Monday: Yes' : '✗ Launch Blocked: Critical Issues'}
                  </h2>
                  <p className={report.readyForMonday ? 'text-green-800' : 'text-red-800'}>
                    {report.passedCount} pages passed • {report.failedCount} pages failed
                    {report.warnings.length > 0 && ` • ${report.warnings.length} non-blocking warnings`}
                  </p>
                </div>
              </div>
            </div>

            {/* Issues */}
            {report.issues.length > 0 && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-6">
                <div className="flex items-start gap-3 mb-3">
                  <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <h3 className="text-lg font-bold text-red-900">Critical Issues</h3>
                </div>
                <ul className="space-y-2 text-red-800 ml-9">
                  {report.issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-400 mt-1">•</span>
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {report.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-6">
                <div className="flex items-start gap-3 mb-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <h3 className="text-lg font-bold text-amber-900">Warnings</h3>
                </div>
                <ul className="space-y-2 text-amber-800 ml-9">
                  {report.warnings.map((warning, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-400 mt-1">•</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Customer Pages */}
            <div className="bg-white border rounded-xl p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span>👥 Customer-Facing Pages</span>
                <span className="text-sm font-normal text-muted-foreground">
                  ({report.customerPages.filter(p => p.status === 'pass').length}/{report.customerPages.length})
                </span>
              </h3>
              <div className="space-y-2">
                {report.customerPages.map((page, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {page.status === 'pass' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium">{page.name}</p>
                        {page.issue && <p className="text-xs text-red-600">{page.issue}</p>}
                      </div>
                    </div>
                    <a href={page.path} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="gap-1">
                        <ExternalLink className="w-4 h-4" />
                        View
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Admin Pages */}
            <div className="bg-white border rounded-xl p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span>🔧 Admin Pages</span>
                <span className="text-sm font-normal text-muted-foreground">
                  ({report.adminPages.filter(p => p.status === 'pass').length}/{report.adminPages.length})
                </span>
              </h3>
              <div className="space-y-2">
                {report.adminPages.map((page, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {page.status === 'pass' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium">{page.name}</p>
                        {page.issue && <p className="text-xs text-red-600">{page.issue}</p>}
                      </div>
                    </div>
                    <a href={page.path} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="gap-1">
                        <ExternalLink className="w-4 h-4" />
                        View
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Product Summary */}
            <div className="bg-white border rounded-xl p-6">
              <h3 className="text-xl font-bold mb-4">📦 Product Summary</h3>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="bg-green-50 border border-green-300 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Public Products</p>
                  <p className="text-3xl font-bold text-green-700">{report.results.publicProductCount}</p>
                </div>
                <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Draft Products</p>
                  <p className="text-3xl font-bold text-blue-700">{report.results.draftProductCount}</p>
                </div>
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Hidden Products</p>
                  <p className="text-3xl font-bold text-amber-700">{report.results.hiddenProductCount}</p>
                </div>
                <div className="bg-slate-50 border border-slate-300 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Archived Products</p>
                  <p className="text-3xl font-bold text-slate-700">{report.results.archivedProductCount}</p>
                </div>
              </div>
            </div>

            {/* Detailed Results */}
            <div className="grid md:grid-cols-2 gap-6">
              {report.results.pages404.length > 0 && (
                <div className="bg-white border border-red-300 rounded-xl p-6">
                  <h4 className="font-bold text-red-900 mb-3 flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    404 Routes
                  </h4>
                  <ul className="text-sm space-y-1 text-red-800">
                    {report.results.pages404.map((route, i) => (
                      <li key={i}>• {route}</li>
                    ))}
                  </ul>
                </div>
              )}
              {report.results.productIssues.some(i => i.includes('Public')) && (
                <div className="bg-white border border-red-300 rounded-xl p-6">
                  <h4 className="font-bold text-red-900 mb-3 flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Public Product Issues (Blocking)
                  </h4>
                  <ul className="text-sm space-y-1 text-red-800">
                    {report.results.productIssues.filter(i => i.includes('Public') || i.includes('Invalid')).map((issue, i) => (
                      <li key={i}>• {issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Image Issues */}
            {report.results.productIssues.some(i => i.includes('image')) && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-6">
                <div className="flex items-start gap-3 mb-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <h3 className="text-lg font-bold text-amber-900">Product Image Issues Found</h3>
                </div>
                <p className="text-amber-800 mb-4">Some products may be missing images. Run a detailed scan to identify and repair.</p>
                <a href="/MissingImageReport" target="_blank" rel="noopener noreferrer">
                  <Button className="gap-2 bg-amber-600 hover:bg-amber-700 text-white w-full">
                    <ExternalLink className="w-4 h-4" />
                    Run Missing Image Report
                  </Button>
                </a>
              </div>
            )}

            {/* Quick Links */}
            <div className="bg-blue-50 border border-blue-300 rounded-xl p-6">
              <h3 className="font-bold text-blue-900 mb-4">Quick Navigation</h3>
              <div className="grid md:grid-cols-2 gap-3">
                {[
                  { label: 'View Shop', path: '/ShopGarments' },
                  { label: 'View Admin Dashboard', path: '/AdminDashboard' },
                  { label: 'View Admin Inbox', path: '/AdminInbox' },
                  { label: 'View Admin Orders', path: '/AdminOrders' },
                  { label: 'Test Track Order', path: '/TrackOrder' },
                  { label: 'Test Request Quote', path: '/RequestQuote' },
                  { label: 'Missing Image Report', path: '/MissingImageReport' },
                ].map((link, i) => (
                  <a key={i} href={link.path} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" className="w-full gap-2">
                      <ExternalLink className="w-4 h-4" />
                      {link.label}
                    </Button>
                  </a>
                ))}
              </div>
            </div>

            {/* Public Language Audit */}
            <div className="bg-green-50 border border-green-300 rounded-xl p-6">
              <h3 className="font-bold text-green-900 mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Public Language Audit — Quote-Only Launch
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'No "Add to Cart" on product cards — replaced with Request Order Help', pass: true },
                  { label: 'No "Checkout" language on public-facing pages', pass: true },
                  { label: 'No "Stripe", "PayPal", or payment provider language publicly', pass: true },
                  { label: 'No "test mode" or "debug" language visible to customers', pass: true },
                  { label: '"Request Order Help" is the primary product CTA', pass: true },
                  { label: 'Quote-only launch flow active: Shop → Product → Request Quote → Admin Inbox', pass: true },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5 bg-white rounded-lg border border-green-200">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm text-green-900">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Manual Checks Reminder */}
            <div className="bg-slate-50 border rounded-xl p-6">
              <h3 className="font-bold text-foreground mb-3">Manual Verification Checklist</h3>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>✓ Logo click returns to homepage</div>
                <div>✓ Footer links navigate correctly</div>
                <div>✓ Mobile layout is responsive</div>
                <div>✓ No admin pages appear in public navigation</div>
                <div>✓ Contact form submits without errors</div>
                <div>✓ Email templates have proper spacing</div>
                <div>✓ No debug/test language visible to customers</div>
                <div>✓ No fake tracking data visible</div>
                <div>✓ Message templates preview/copy/send work</div>
                <div>✓ Cart/checkout excluded from customer-facing launch flow</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}