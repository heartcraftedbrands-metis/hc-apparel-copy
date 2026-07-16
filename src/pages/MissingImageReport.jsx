import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertCircle, XCircle, ExternalLink, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';

export default function MissingImageReport() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [report, setReport] = useState(null);

  const scanImages = async () => {
    setScanning(true);
    try {
      const products = await base44.entities.Product.list('-created_date', 500);
      
      const issues = {
        publicMissing: [],
        draftMissing: [],
        repaired: [],
        repairLog: [],
      };

      for (const product of products) {
        const hasMainImage = product.image_url && product.image_url.trim();
        const hasVariantImages = product.mockup_images && product.mockup_images.length > 0;
        
        if (!hasMainImage && !hasVariantImages) {
          const issue = {
            name: product.name,
            id: product.id,
            brand: product.supplier_sku ? product.supplier_sku.split('-')[0] : '—',
            visibility: product.visibility,
            images: {
              main: hasMainImage ? '✓' : '✗',
              variant: hasVariantImages ? '✓' : '✗',
            },
          };
          
          if (product.visibility === 'public') {
            issues.publicMissing.push(issue);
          } else {
            issues.draftMissing.push(issue);
          }
        }
      }

      setReport({
        totalProducts: products.length,
        publicProducts: products.filter(p => p.visibility === 'public').length,
        draftProducts: products.filter(p => p.visibility !== 'public').length,
        publicMissingCount: issues.publicMissing.length,
        draftMissingCount: issues.draftMissing.length,
        issues,
      });
    } catch (err) {
      alert('Scan error: ' + err.message);
    }
    setScanning(false);
  };

  const repairPublicImages = async () => {
    if (!report || report.publicMissingCount === 0) {
      alert('No public products with missing images to repair');
      return;
    }

    setRepairing(true);
    const repairLog = [];

    try {
      const products = await base44.entities.Product.list('-created_date', 500);
      
      for (const issue of report.issues.publicMissing) {
        const product = products.find(p => p.id === issue.id);
        if (!product) continue;

        const hasMainImage = product.image_url && product.image_url.trim();
        const hasVariantImages = product.mockup_images && product.mockup_images.length > 0;

        let repaired = false;
        const updates = {};

        // If variant images exist but no main image, use first variant as main
        if (!hasMainImage && hasVariantImages && hasVariantImages[0]) {
          updates.image_url = hasVariantImages[0];
          repaired = true;
          repairLog.push(`${product.name}: Used first variant image as main image`);
        }

        // Try to get image from garment catalog by brand/style
        if (!repaired) {
          try {
            const garments = await base44.entities.GarmentCatalog.filter(
              {
                brand: product.supplier_sku ? product.supplier_sku.split('-')[0] : '',
              },
              '-created_date',
              5
            );
            const garmentWithImage = garments.find(g => g.image_url && g.image_url.trim());
            if (garmentWithImage) {
              updates.image_url = garmentWithImage.image_url;
              repaired = true;
              repairLog.push(`${product.name}: Used catalog image (${garmentWithImage.product_name})`);
            }
          } catch (err) {
            // Continue if catalog lookup fails
          }
        }

        // Update product if images found
        if (repaired && Object.keys(updates).length > 0) {
          await base44.entities.Product.update(product.id, updates);
          report.issues.repaired.push({
            name: product.name,
            action: repairLog[repairLog.length - 1],
          });
        } else {
          repairLog.push(`${product.name}: Could not find replacement image`);
        }
      }

      setReport({
        ...report,
        issues: {
          ...report.issues,
          repairLog,
        },
        repairComplete: true,
      });
    } catch (err) {
      alert('Repair error: ' + err.message);
    }

    setRepairing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Missing Image Report</h1>
          <p className="text-muted-foreground">Scan and repair product images before launch</p>
        </div>

        {/* Control buttons */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Button
            size="lg"
            onClick={scanImages}
            disabled={scanning}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            <Search className="w-5 h-5" />
            {scanning ? 'Scanning...' : 'Run Missing Image Scan'}
          </Button>
          {report && report.publicMissingCount > 0 && (
            <Button
              size="lg"
              onClick={repairPublicImages}
              disabled={repairing || report.repairComplete}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {repairing ? 'Repairing...' : 'Repair Public Product Images'}
            </Button>
          )}
          <Button
            size="lg"
            variant="outline"
            onClick={() => navigate('/LaunchReadinessQA')}
            className="gap-2"
          >
            <ExternalLink className="w-5 h-5" />
            Re-run Launch QA
          </Button>
        </div>

        {/* Report */}
        {report && (
          <div className="space-y-6">
            {/* Summary */}
            <div className={`rounded-xl p-6 border-2 ${
              report.publicMissingCount === 0
                ? 'bg-green-50 border-green-300'
                : 'bg-amber-50 border-amber-300'
            }`}>
              <div className="flex items-start gap-4">
                {report.publicMissingCount === 0 ? (
                  <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-8 h-8 text-amber-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <h2 className={`text-2xl font-bold mb-2 ${
                    report.publicMissingCount === 0 ? 'text-green-900' : 'text-amber-900'
                  }`}>
                    {report.publicMissingCount === 0
                      ? '✓ All Public Products Have Images'
                      : `⚠ ${report.publicMissingCount} Public Product(s) Missing Images`}
                  </h2>
                  <p className={report.publicMissingCount === 0 ? 'text-green-800' : 'text-amber-800'}>
                    Total products: {report.totalProducts} •
                    Public: {report.publicProducts} •
                    Draft/Admin: {report.draftProducts}
                  </p>
                </div>
              </div>
            </div>

            {/* Repair Log */}
            {report.issues.repairLog.length > 0 && (
              <div className="bg-blue-50 border border-blue-300 rounded-xl p-6">
                <h3 className="font-bold text-blue-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Repair Log
                </h3>
                <ul className="space-y-2 text-blue-800 text-sm">
                  {report.issues.repairLog.map((log, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-blue-400 mt-0.5">•</span>
                      <span>{log}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Public Products Missing Images */}
            {report.issues.publicMissing.length > 0 && (
              <div className="bg-white border border-red-300 rounded-xl p-6">
                <h3 className="text-lg font-bold text-red-900 mb-4 flex items-center gap-2">
                  <XCircle className="w-6 h-6" />
                  Public Products Missing Images ({report.issues.publicMissing.length})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-red-50 border-b border-red-200">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold text-red-900">Product Name</th>
                        <th className="text-left px-4 py-2 font-semibold text-red-900">Brand</th>
                        <th className="text-left px-4 py-2 font-semibold text-red-900">Main Image</th>
                        <th className="text-left px-4 py-2 font-semibold text-red-900">Variant Images</th>
                        <th className="text-left px-4 py-2 font-semibold text-red-900">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.issues.publicMissing.map((issue, i) => (
                        <tr key={i} className="border-b border-red-100 hover:bg-red-50">
                          <td className="px-4 py-3">
                            <a href={`/AdminProducts?search=${issue.name}`} target="_blank" rel="noopener noreferrer">
                              <button className="text-blue-600 hover:underline font-medium">{issue.name}</button>
                            </a>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{issue.brand}</td>
                          <td className="px-4 py-3">
                            <span className={issue.images.main === '✓' ? 'text-green-600' : 'text-red-600'}>
                              {issue.images.main}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={issue.images.variant === '✓' ? 'text-green-600' : 'text-red-600'}>
                              {issue.images.variant}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-amber-600 font-medium">
                            {report.repairComplete ? 'Needs manual edit' : 'Pending'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Draft/Admin Products Missing Images */}
            {report.issues.draftMissing.length > 0 && (
              <div className="bg-white border border-amber-300 rounded-xl p-6">
                <h3 className="text-lg font-bold text-amber-900 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-6 h-6" />
                  Draft/Admin Products Missing Images ({report.issues.draftMissing.length})
                </h3>
                <p className="text-amber-800 text-sm mb-4">These are not blocking launch but should be reviewed:</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-50 border-b border-amber-200">
                      <tr>
                        <th className="text-left px-4 py-2 font-semibold text-amber-900">Product Name</th>
                        <th className="text-left px-4 py-2 font-semibold text-amber-900">Status</th>
                        <th className="text-left px-4 py-2 font-semibold text-amber-900">Main Image</th>
                        <th className="text-left px-4 py-2 font-semibold text-amber-900">Variant Images</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.issues.draftMissing.map((issue, i) => (
                        <tr key={i} className="border-b border-amber-100 hover:bg-amber-50">
                          <td className="px-4 py-3">
                            <a href={`/AdminProducts?search=${issue.name}`} target="_blank" rel="noopener noreferrer">
                              <button className="text-blue-600 hover:underline">{issue.name}</button>
                            </a>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground capitalize">{issue.visibility}</td>
                          <td className="px-4 py-3">
                            <span className={issue.images.main === '✓' ? 'text-green-600' : 'text-red-600'}>
                              {issue.images.main}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={issue.images.variant === '✓' ? 'text-green-600' : 'text-red-600'}>
                              {issue.images.variant}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Products with Images */}
            <div className="bg-green-50 border border-green-300 rounded-xl p-6">
              <h3 className="text-lg font-bold text-green-900 mb-2 flex items-center gap-2">
                <CheckCircle className="w-6 h-6" />
                Products with Images: {report.totalProducts - report.publicMissingCount - report.draftMissingCount}
              </h3>
              <p className="text-green-800 text-sm">All other products have at least one image</p>
            </div>

            {/* Next Steps */}
            <div className="bg-blue-50 border border-blue-300 rounded-xl p-6">
              <h3 className="font-bold text-blue-900 mb-3">Next Steps</h3>
              <ol className="space-y-2 text-blue-900 text-sm ml-4 list-decimal">
                <li>Review public products with missing images above</li>
                <li>Manually upload images to products in Admin Products if repair didn't complete</li>
                <li>Click "Re-run Launch QA" to verify the warning is cleared</li>
                <li>If draft/test products missing images, skip them (non-blocking)</li>
              </ol>
            </div>

            {/* Quick Links */}
            <div className="grid md:grid-cols-2 gap-4">
              <a href="/ShopGarments" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full gap-2">
                  <ExternalLink className="w-4 h-4" />
                  View Shop Garments
                </Button>
              </a>
              <a href="/AdminProducts" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Admin Products
                </Button>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}