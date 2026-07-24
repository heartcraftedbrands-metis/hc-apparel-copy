import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Archive,
  ClipboardCheck,
  Eye,
  EyeOff,
  Globe,
  ImagePlus,
  LockKeyhole,
  Package,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { isDigitalProduct } from "@/lib/productVisibility";
import SSProductPlaceholder from "@/components/ss/SSProductPlaceholder";

const CATEGORY_OPTIONS = [
  { value: 'digital_designs', label: 'Digital Designs' },
  { value: 'halftone_packs', label: '↳ Halftone Packs' },
  { value: 'distressed_packs', label: '↳ Distressed Packs' },
  { value: 'design_elements', label: '↳ Design Elements' },
  { value: 'short_sleeve_shirts', label: 'Short Sleeve (Unisex)' },
  { value: 'mens_short_sleeve_shirts', label: "Short Sleeve — Men's" },
  { value: 'womens_short_sleeve_shirts', label: "Short Sleeve — Women's" },
  { value: 'youth_short_sleeve_shirts', label: 'Short Sleeve — Youth' },
  { value: 'long_sleeve_shirts', label: 'Long Sleeve (Unisex)' },
  { value: 'mens_long_sleeve_shirts', label: "Long Sleeve — Men's" },
  { value: 'womens_long_sleeve_shirts', label: "Long Sleeve — Women's" },
  { value: 'youth_long_sleeve_shirts', label: 'Long Sleeve — Youth' },
  { value: 'crewnecks', label: 'Crewnecks (Unisex)' },
  { value: 'mens_crewnecks', label: "Crewnecks — Men's" },
  { value: 'womens_crewnecks', label: "Crewnecks — Women's" },
  { value: 'youth_crewnecks', label: 'Crewnecks — Youth' },
  { value: 'polo_shirts', label: 'Polos (Unisex)' },
  { value: 'mens_polo_shirts', label: "Polos — Men's" },
  { value: 'womens_polo_shirts', label: "Polos — Women's" },
  { value: 'youth_polo_shirts', label: 'Polos — Youth' },
  { value: 'jackets', label: 'Jackets (Unisex)' },
  { value: 'mens_jackets', label: "Jackets — Men's" },
  { value: 'womens_jackets', label: "Jackets — Women's" },
  { value: 'youth_jackets', label: 'Jackets — Youth' },
  { value: 'sportswear', label: 'Sportswear (Unisex)' },
  { value: 'mens_sportswear', label: "Sportswear — Men's" },
  { value: 'womens_sportswear', label: "Sportswear — Women's" },
  { value: 'youth_sportswear', label: 'Sportswear — Youth' },
  { value: 'hoodies', label: 'Hoodies' },
  { value: 'hats', label: 'Hats' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'other', label: 'Other / Print Support' },
];

const GARMENT_CATS = ['short_sleeve_shirts','mens_short_sleeve_shirts','womens_short_sleeve_shirts','youth_short_sleeve_shirts','long_sleeve_shirts','mens_long_sleeve_shirts','womens_long_sleeve_shirts','youth_long_sleeve_shirts','crewnecks','mens_crewnecks','womens_crewnecks','youth_crewnecks','polo_shirts','mens_polo_shirts','womens_polo_shirts','youth_polo_shirts','jackets','mens_jackets','womens_jackets','youth_jackets','sportswear','mens_sportswear','womens_sportswear','youth_sportswear','hoodies','hats'];
const PRINT_SUPPORT_CATS = ['accessories', 'other'];

const QUICK_SIZE_SETS = [
  { label: 'S–3XL', sizes: ['S','M','L','XL','2XL','3XL'] },
  { label: 'XS–3XL', sizes: ['XS','S','M','L','XL','2XL','3XL'] },
  { label: 'S–XL', sizes: ['S','M','L','XL'] },
  { label: 'Youth S–XL', sizes: ['YS','YM','YL','YXL'] },
];

const MODEL_SIZES = { '64000':['S','M','L','XL','2XL','3XL'], '6110':['XS','S','M','L','XL','2XL','3XL'], '3010':['S','M','L','XL'], '5180':['S','M','L','XL','2XL','3XL'], '299':['S','M','L','XL','2XL','3XL'] };
function detectModelSizes(name) { if (!name) return null; for (const [k,s] of Object.entries(MODEL_SIZES)) { if (name.includes(k)) return { key: k, sizes: s }; } return null; }

const VISIBILITY_CONFIG = {
  public:        { label: 'Public',        color: 'bg-green-100 text-green-800',  icon: Globe },
  draft:         { label: 'Draft',         color: 'bg-yellow-100 text-yellow-800', icon: EyeOff },
  hidden:        { label: 'Hidden',        color: 'bg-gray-100 text-gray-600',     icon: EyeOff },
  admin_archive: { label: 'Admin Only',    color: 'bg-purple-100 text-purple-800', icon: Archive },
};

const FILTER_TABS = [
  { key: 'all',           label: 'All Products' },
  { key: 'public',        label: 'Public' },
  { key: 'draft',         label: 'Draft' },
  { key: 'draft_ss',      label: 'Draft S&S' },
  { key: 'hidden',        label: 'Hidden' },
  { key: 'admin_archive', label: 'Digital Archive' },
  { key: 'garments',      label: 'Garments' },
  { key: 'print_support', label: 'Print Support' },
  { key: 'no_image',      label: 'Missing Image' },
];

const PRODUCT_SUBTYPES = [
  { value: 't_shirts', label: 'T-Shirts' },
  { value: 'hoodies', label: 'Hoodies' },
  { value: 'sweatshirts', label: 'Sweatshirts' },
  { value: 'hats', label: 'Hats' },
  { value: 'kids_apparel', label: 'Kids Apparel' },
  { value: 'apparel_blanks', label: 'Apparel Blanks' },
  { value: 'custom_printed', label: 'Custom Printed Garments' },
  { value: 'print_support', label: 'Print Support Products' },
  { value: 'other', label: 'Other' },
];

const EMPTY_FORM = {
  name: '', description: '', price: '', sale_price: '', product_type: 'physical',
  product_subtype: '', design_type: '',
  visibility: 'public', category: 'other', categories: [], stock: 0,
  image_url: '', mockup_images: [], file_url: '',
  available_sizes: [], available_colors: [], size_prices: [],
  tags: [], is_featured: false, is_best_seller: false,
  care_instructions: '', shipping_note: '',
  vendor_source: '', vendor_cost: '', blank_garment_cost: '', print_cost_estimate: '',
  profit_estimate: '', internal_notes: '', supplier_sku: '', vendor_pricing_id: '',
};

export default function AdminProducts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingMockup, setIsUploadingMockup] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [mockupInput, setMockupInput] = useState('');
  const [sizeInput, setSizeInput] = useState('');
  const [sizePriceInput, setSizePriceInput] = useState({ size: '', price: '' });
  const [colorNameInput, setColorNameInput] = useState('');
  const [colorHexInput, setColorHexInput] = useState('#000000');
  const [activeTab, setActiveTab] = useState(
    FILTER_TABS.some(tab => tab.key === requestedTab) ? requestedTab : 'all'
  );

  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => base44.entities.Product.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Product.create(data),
    onSuccess: () => { queryClient.invalidateQueries(['admin-products']); setIsDialogOpen(false); resetForm(); toast.success('Product created successfully.'); },
    onError: () => { toast.error('Product creation failed. Please check required fields.'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(['admin-products']); setIsDialogOpen(false); setEditingProduct(null); resetForm(); toast.success('Product updated successfully.'); },
    onError: () => { toast.error('Product update failed. Please check required fields.'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['admin-products']); toast.success('Product deleted'); },
  });

  const quickVisibility = useMutation({
    mutationFn: ({ id, visibility }) => base44.entities.Product.update(id, { visibility, is_active: visibility === 'public' }),
    onSuccess: () => { queryClient.invalidateQueries(['admin-products']); toast.success('Visibility updated'); },
  });

  const resetForm = () => { setFormData(EMPTY_FORM); setMockupInput(''); setSizeInput(''); setSizePriceInput({ size: '', price: '' }); setColorNameInput(''); setColorHexInput('#000000'); };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || '',
      description: product.description || '',
      price: product.price || '',
      sale_price: product.sale_price || '',
      product_type: product.product_type || 'physical',
      product_subtype: product.product_subtype || '',
      design_type: product.design_type || '',
      visibility: product.visibility || (product.is_active ? 'public' : 'hidden'),
      category: product.category || 'other',
      categories: product.categories || (product.category ? [product.category] : []),
      stock: product.stock || 0,
      image_url: product.image_url || '',
      mockup_images: product.mockup_images || [],
      file_url: product.file_url || '',
      available_sizes: product.available_sizes || [],
      available_colors: product.available_colors || [],
      size_prices: product.size_prices || [],
      tags: product.tags || [],
      is_featured: product.is_featured || false,
      is_best_seller: product.is_best_seller || false,
      care_instructions: product.care_instructions || '',
      shipping_note: product.shipping_note || '',
      vendor_source: product.vendor_source || '',
      vendor_cost: product.vendor_cost || '',
      blank_garment_cost: product.blank_garment_cost || '',
      print_cost_estimate: product.print_cost_estimate || '',
      profit_estimate: product.profit_estimate || '',
      internal_notes: product.internal_notes || '',
      supplier_sku: product.supplier_sku || '',
      vendor_pricing_id: product.vendor_pricing_id || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.name?.trim()) {
      toast.error('Product name is required');
      return;
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      toast.error('Price is required and must be greater than 0');
      return;
    }
    if (!formData.visibility) {
      toast.error('Product status is required');
      return;
    }
    if (
      editingProduct?.is_sample
      && editingProduct?.vendor_source === 'S&S Activewear'
      && formData.visibility === 'public'
    ) {
      toast.error('Private S&S test drafts must pass the separate approval workflow before publishing.');
      return;
    }

    // Build update object with proper type conversions
    const data = {
      name: formData.name.trim(),
      description: formData.description || '',
      price: parseFloat(formData.price),
      sale_price: formData.sale_price ? parseFloat(formData.sale_price) : null,
      product_type: formData.product_type || 'physical',
      product_subtype: formData.product_subtype || '',
      design_type: formData.design_type || '',
      visibility: formData.visibility,
      category: formData.category || 'other',
      categories: formData.categories || [],
      stock: parseInt(formData.stock) || 0,
      image_url: formData.image_url || '',
      mockup_images: formData.mockup_images || [],
      file_url: formData.file_url || '',
      available_sizes: formData.available_sizes || [],
      available_colors: formData.available_colors || [],
      size_prices: formData.size_prices || [],
      tags: formData.tags || [],
      is_featured: !!formData.is_featured,
      is_best_seller: !!formData.is_best_seller,
      care_instructions: formData.care_instructions || '',
      shipping_note: formData.shipping_note || '',
      is_active: formData.visibility === 'public',
      // Optional admin fields — include only if non-empty
      ...(formData.vendor_source && { vendor_source: formData.vendor_source }),
      ...(formData.supplier_sku && { supplier_sku: formData.supplier_sku }),
      ...(formData.vendor_cost && { vendor_cost: parseFloat(formData.vendor_cost) }),
      ...(formData.blank_garment_cost && { blank_garment_cost: parseFloat(formData.blank_garment_cost) }),
      ...(formData.print_cost_estimate && { print_cost_estimate: parseFloat(formData.print_cost_estimate) }),
      ...(formData.profit_estimate && { profit_estimate: parseFloat(formData.profit_estimate) }),
      ...(formData.internal_notes && { internal_notes: formData.internal_notes }),
      ...(formData.vendor_pricing_id && { vendor_pricing_id: formData.vendor_pricing_id }),
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFormData(prev => ({ ...prev, [type]: file_url }));
    toast.success('File uploaded');
    setIsUploading(false);
  };

  const handleMockupFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setIsUploadingMockup(true);
    const urls = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setFormData(prev => ({ ...prev, mockup_images: [...(prev.mockup_images || []), ...urls] }));
    toast.success(`${urls.length} image${urls.length > 1 ? 's' : ''} uploaded`);
    e.target.value = '';
    setIsUploadingMockup(false);
  };

  // Filter products by active tab
  const filteredProducts = products.filter(p => {
    const vis = p.visibility || (p.is_active ? 'public' : 'hidden');
    const cats = p.categories?.length ? p.categories : (p.category ? [p.category] : []);
    const isSS = p.vendor_source === 'S&S Activewear';
    const hasNoImage = !p.image_url;
    if (activeTab === 'all') return true;
    if (activeTab === 'public') return vis === 'public';
    if (activeTab === 'draft') return vis === 'draft';
    if (activeTab === 'draft_ss') return vis === 'draft' && isSS;
    if (activeTab === 'hidden') return vis === 'hidden';
    if (activeTab === 'admin_archive') return vis === 'admin_archive' || isDigitalProduct(p);
    if (activeTab === 'garments') return cats.some(c => GARMENT_CATS.includes(c));
    if (activeTab === 'print_support') return cats.some(c => PRINT_SUPPORT_CATS.includes(c));
    if (activeTab === 'no_image') return hasNoImage;
    return true;
  });

  // Tab counts
  const counts = {
    all: products.length,
    public: products.filter(p => (p.visibility || (p.is_active ? 'public' : 'hidden')) === 'public').length,
    draft: products.filter(p => (p.visibility || (p.is_active ? 'public' : 'hidden')) === 'draft').length,
    draft_ss: products.filter(p => (p.visibility || (p.is_active ? 'public' : 'hidden')) === 'draft' && p.vendor_source === 'S&S Activewear').length,
    hidden: products.filter(p => (p.visibility || (p.is_active ? 'public' : 'hidden')) === 'hidden').length,
    admin_archive: products.filter(p => (p.visibility || (p.is_active ? 'public' : 'hidden')) === 'admin_archive' || isDigitalProduct(p)).length,
    garments: products.filter(p => { const c = p.categories?.length ? p.categories : (p.category ? [p.category] : []); return c.some(x => GARMENT_CATS.includes(x)); }).length,
    print_support: products.filter(p => { const c = p.categories?.length ? p.categories : (p.category ? [p.category] : []); return c.some(x => PRINT_SUPPORT_CATS.includes(x)); }).length,
    no_image: products.filter(p => !p.image_url).length,
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Products</h1>
            <p className="text-primary-foreground/70 text-sm">Manage your product catalog and visibility</p>
          </div>
          <Button onClick={() => { resetForm(); setEditingProduct(null); setIsDialogOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSearchParams(tab.key === 'all' ? {} : { tab: tab.key });
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white border text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.key === 'admin_archive' && <Archive className="w-3.5 h-3.5" />}
              {tab.label}
              <span className={`text-xs rounded-full px-1.5 py-0.5 ${activeTab === tab.key ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
                {counts[tab.key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {activeTab === 'draft_ss' && (
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-bold text-amber-950">
                <LockKeyhole className="h-4 w-4" />
                Private S&amp;S pricing test
              </h2>
              <p className="mt-1 text-sm text-amber-900">
                Direct publishing is locked. Review image, price, variants, inventory, and privacy checks first.
              </p>
            </div>
            <Link to="/AdminSSDraftReview">
              <Button>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Run private draft QA
              </Button>
            </Link>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="bg-white rounded-xl aspect-[3/4] animate-pulse" />)}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground mb-4">No products in this category</p>
            <Button onClick={() => { resetForm(); setEditingProduct(null); setIsDialogOpen(true); }} className="gap-2">
              <Plus className="w-4 h-4" /> Add Product
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map(product => {
              const vis = product.visibility || (product.is_active ? 'public' : 'hidden');
              const vc = VISIBILITY_CONFIG[vis] || VISIBILITY_CONFIG.hidden;
              const isArchived = vis === 'admin_archive';
              const isPrivateSSTest = vis === 'draft'
                && product.vendor_source === 'S&S Activewear'
                && product.is_sample;
              return (
                <div key={product.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow ${isArchived ? 'opacity-70' : ''}`}>
                  <div className="aspect-square bg-muted overflow-hidden relative">
                    {product.image_url
                      ? <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                      : product.vendor_source === 'S&S Activewear'
                      ? <SSProductPlaceholder brand={product.tags?.[0]} styleNumber={product.supplier_sku} size="md" />
                      : <div className="w-full h-full flex items-center justify-center text-muted-foreground/20 font-bold text-3xl">HC</div>
                    }
                    {/* Visibility badge */}
                    <div className={`absolute top-2 left-2 flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${vc.color}`}>
                      <vc.icon className="w-3 h-3" />
                      {vc.label}
                    </div>
                    {/* S&S source badge */}
                    {product.vendor_source === 'S&S Activewear' && (
                      <div className="absolute top-2 right-2 bg-purple-100 text-purple-800 text-xs font-bold px-2 py-0.5 rounded-full">
                        S&S
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm line-clamp-1 mb-0.5">{product.name}</p>
                    <p className="text-accent font-bold text-sm mb-1">${product.price?.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      {product.product_subtype ? product.product_subtype.replace(/_/g, ' ') : 'Physical'} · {product.category?.replace(/_/g, ' ') || 'Other'}
                    </p>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={() => handleEdit(product)}>
                        <Pencil className="w-3 h-3" /> Edit
                      </Button>
                      {/* Quick visibility toggle */}
                      {isPrivateSSTest ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          title="Publishing locked until private QA is approved"
                          disabled
                        >
                          <LockKeyhole className="w-3 h-3" />
                        </Button>
                      ) : vis !== 'public' ? (
                        <Button size="sm" className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white" title="Make Public"
                          onClick={() => quickVisibility.mutate({ id: product.id, visibility: 'public' })}>
                          <Eye className="w-3 h-3" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-orange-500 hover:bg-orange-50" title="Hide"
                          onClick={() => quickVisibility.mutate({ id: product.id, visibility: 'hidden' })}>
                          <EyeOff className="w-3 h-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:bg-red-50"
                        onClick={() => deleteMutation.mutate(product.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Product Form Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Product Name *</Label>
              <Input value={formData.name} onChange={e => setFormData(p => ({...p, name: e.target.value}))} required className="mt-1" />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={e => setFormData(p => ({...p, description: e.target.value}))} rows={3} className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price ($) *</Label>
                <Input type="number" step="0.01" min="0" value={formData.price} onChange={e => setFormData(p => ({...p, price: e.target.value}))} required className="mt-1" />
              </div>
              <div>
                <Label>Sale Price ($) <span className="text-xs text-muted-foreground">optional</span></Label>
                <Input type="number" step="0.01" min="0" value={formData.sale_price} onChange={e => setFormData(p => ({...p, sale_price: e.target.value}))} placeholder="Leave blank if no sale" className="mt-1" />
              </div>
              <div>
                <Label>Product Type *</Label>
                <Select value={formData.product_type} onValueChange={v => setFormData(p => ({...p, product_type: v}))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physical">Physical Garment</SelectItem>
                    <SelectItem value="digital">Digital File</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Product Subtype</Label>
                <Select value={formData.product_subtype || ''} onValueChange={v => setFormData(p => ({...p, product_subtype: v}))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select subtype..." /></SelectTrigger>
                  <SelectContent>
                    {PRODUCT_SUBTYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Featured / Best Seller */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!formData.is_featured} onChange={e => setFormData(p => ({...p, is_featured: e.target.checked}))} className="w-4 h-4 rounded" />
                <span className="font-medium">⭐ Featured Product</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!formData.is_best_seller} onChange={e => setFormData(p => ({...p, is_best_seller: e.target.checked}))} className="w-4 h-4 rounded" />
                <span className="font-medium">🔥 Best Seller</span>
              </label>
            </div>

            {/* Visibility */}
            <div className="bg-muted/30 rounded-xl p-4">
              <Label className="mb-2 block font-bold">Product Visibility</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(VISIBILITY_CONFIG).map(([val, cfg]) => (
                  <button
                    key={val}
                    type="button"
                    disabled={
                      val === 'public'
                      && editingProduct?.is_sample
                      && editingProduct?.vendor_source === 'S&S Activewear'
                    }
                    onClick={() => setFormData(p => ({...p, visibility: val}))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                      formData.visibility === val
                        ? 'border-primary bg-primary text-primary-foreground font-semibold'
                        : 'border-border bg-white hover:bg-muted'
                    } ${
                      val === 'public'
                      && editingProduct?.is_sample
                      && editingProduct?.vendor_source === 'S&S Activewear'
                        ? 'cursor-not-allowed opacity-40'
                        : ''
                    }`}
                  >
                    <cfg.icon className="w-4 h-4 flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-medium">{cfg.label}</div>
                      <div className={`text-xs ${formData.visibility === val ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                        {val === 'public' && 'Shows on website'}
                        {val === 'draft' && 'Admin only, not published'}
                        {val === 'hidden' && 'Exists but not shown'}
                        {val === 'admin_archive' && 'Digital archive, never public'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Design Type <span className="text-xs text-muted-foreground">(for filters)</span></Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {[['','None'],['halftone','Halftone'],['fulltone','Full-Tone'],['bundle','Bundle']].map(([v,l]) => (
                  <button key={v} type="button" onClick={() => setFormData(p => ({...p, design_type: v}))}
                    className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${formData.design_type === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/50 hover:bg-muted border-border'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label>Categories <span className="text-xs text-muted-foreground">(select all that apply)</span></Label>
              <div className="mt-2 border rounded-lg p-3 max-h-48 overflow-y-auto grid grid-cols-2 gap-1">
                {CATEGORY_OPTIONS.map(opt => {
                  const checked = (formData.categories || []).includes(opt.value);
                  return (
                    <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 px-2 py-1 rounded">
                      <input type="checkbox" checked={checked} onChange={() => {
                        const current = formData.categories || [];
                        setFormData(p => ({
                          ...p,
                          categories: checked ? current.filter(c => c !== opt.value) : [...current, opt.value],
                          category: !checked ? opt.value : (current.filter(c => c !== opt.value)[0] || 'other'),
                        }));
                      }} className="w-4 h-4 rounded" />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {formData.product_type === 'physical' && (
              <div>
                <Label>Stock Quantity</Label>
                <Input type="number" min="0" value={formData.stock} onChange={e => setFormData(p => ({...p, stock: e.target.value}))} className="mt-1" />
              </div>
            )}

            <div>
              <Label>Product Image</Label>
              <div className="mt-1">
                {formData.image_url && <img src={formData.image_url} alt="Preview" className="w-24 h-24 object-cover rounded mb-2" />}
                <Input type="file" accept="image/*" onChange={e => handleFileUpload(e, 'image_url')} disabled={isUploading} />
              </div>
            </div>

            <div>
              <Label>Mockup Images</Label>
              <div className="mt-1 space-y-2">
                {formData.mockup_images?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.mockup_images.map((url, i) => (
                      <div key={i} className="relative group">
                        <img src={url} alt="" className="w-14 h-14 object-cover rounded border" />
                        <button type="button" onClick={() => setFormData(p => ({...p, mockup_images: p.mockup_images.filter((_, idx) => idx !== i)}))}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100">×</button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="cursor-pointer w-full">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleMockupFileUpload} disabled={isUploadingMockup} />
                  <span className={`flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed rounded-md text-sm font-medium ${isUploadingMockup ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50 cursor-pointer border-border'}`}>
                    <ImagePlus className="w-4 h-4" />{isUploadingMockup ? 'Uploading...' : 'Upload images'}
                  </span>
                </label>
                <div className="flex gap-2">
                  <Input placeholder="Or paste URL..." value={mockupInput} onChange={e => setMockupInput(e.target.value)} />
                  <Button type="button" variant="outline" onClick={() => { if (mockupInput.trim()) { setFormData(p => ({...p, mockup_images: [...(p.mockup_images||[]), mockupInput.trim()]})); setMockupInput(''); } }}>Add</Button>
                </div>
              </div>
            </div>

            {formData.product_type === 'digital' && (
              <div>
                <Label>Digital File</Label>
                <div className="mt-1">
                  {formData.file_url && <p className="text-sm text-green-600 mb-2">✓ File uploaded</p>}
                  <Input type="file" onChange={e => handleFileUpload(e, 'file_url')} disabled={isUploading} />
                </div>
              </div>
            )}

            {/* Sizes */}
            <div>
              <Label>Available Sizes</Label>
              {detectModelSizes(formData.name) && (
                <button type="button" onClick={() => setFormData(p => ({...p, available_sizes: detectModelSizes(formData.name).sizes}))}
                  className="mt-1 mb-1 flex items-center gap-1 text-xs text-primary hover:underline font-medium">
                  <Zap className="w-3 h-3" /> Auto-fill from model {detectModelSizes(formData.name).key}
                </button>
              )}
              <div className="flex flex-wrap gap-1 mb-2 mt-1">
                <span className="text-xs text-muted-foreground self-center mr-1">Quick:</span>
                {QUICK_SIZE_SETS.map(set => (
                  <button key={set.label} type="button" onClick={() => setFormData(p => ({...p, available_sizes: set.sizes}))}
                    className="text-xs px-2 py-1 bg-muted hover:bg-muted/80 rounded border border-border">{set.label}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                {(formData.available_sizes || []).map((s, i) => (
                  <span key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm">
                    {s} <button type="button" onClick={() => setFormData(p => ({...p, available_sizes: p.available_sizes.filter((_, idx) => idx !== i)}))} className="text-red-500 ml-1">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input placeholder="e.g. S, M, L" value={sizeInput} onChange={e => setSizeInput(e.target.value)} />
                <Button type="button" variant="outline" onClick={() => { if (sizeInput.trim()) { setFormData(p => ({...p, available_sizes: [...(p.available_sizes||[]), sizeInput.trim()]})); setSizeInput(''); } }}>Add</Button>
              </div>
            </div>

            {/* Size Prices */}
            <div>
              <Label>Size Price Overrides <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <div className="flex flex-wrap gap-2 mt-1 mb-2">
                {(formData.size_prices || []).map((sp, i) => (
                  <span key={i} className="flex items-center gap-1 bg-blue-50 border border-blue-200 px-2 py-1 rounded text-sm">
                    <strong>{sp.size}</strong>: ${parseFloat(sp.price).toFixed(2)}
                    <button type="button" onClick={() => setFormData(p => ({...p, size_prices: p.size_prices.filter((_, idx) => idx !== i)}))} className="text-red-500 ml-1">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Select value={sizePriceInput.size} onValueChange={v => setSizePriceInput(p => ({...p, size: v}))}>
                  <SelectTrigger className="w-28"><SelectValue placeholder="Size" /></SelectTrigger>
                  <SelectContent>{(formData.available_sizes || []).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" step="0.01" min="0" placeholder="Price ($)" value={sizePriceInput.price} onChange={e => setSizePriceInput(p => ({...p, price: e.target.value}))} className="w-32" />
                <Button type="button" variant="outline" onClick={() => {
                  if (sizePriceInput.size && sizePriceInput.price) {
                    const updated = (formData.size_prices || []).filter(sp => sp.size !== sizePriceInput.size);
                    setFormData(p => ({...p, size_prices: [...updated, { size: sizePriceInput.size, price: parseFloat(sizePriceInput.price) }]}));
                    setSizePriceInput({ size: '', price: '' });
                  }
                }}>Set</Button>
              </div>
            </div>

            {/* Colors */}
            <div>
              <Label>Available Colors</Label>
              <div className="flex flex-wrap gap-2 mt-1 mb-2">
                {(formData.available_colors || []).map((c, i) => (
                  <span key={i} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm">
                    {c.hex && <span className="w-3 h-3 rounded-full border" style={{backgroundColor: c.hex}} />}
                    {c.name}
                    <button type="button" onClick={() => setFormData(p => ({...p, available_colors: p.available_colors.filter((_, idx) => idx !== i)}))} className="text-red-500 ml-1">×</button>
                  </span>
                ))}
              </div>
              {formData.mockup_images?.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-2">Click a mockup to add its color:</p>
                  <div className="flex flex-wrap gap-2">
                    {formData.mockup_images.map((url, i) => {
                      const filename = url.split('/').pop() || '';
                      const rawName = filename.replace(/^[^_]*_/, '').replace(/BELLA[_+\s]*CANVAS[_\s]*\d*[_\s]*/i, '').replace(/_(Back|Front|DirectSide|Side|High).*$/i, '').replace(/_/g, ' ').trim();
                      const alreadyAdded = (formData.available_colors || []).some(c => c.name.toLowerCase() === rawName.toLowerCase());
                      return (
                        <button key={i} type="button" title={rawName || 'Add color'} disabled={alreadyAdded}
                          onClick={() => { if (rawName && !alreadyAdded) setFormData(p => ({...p, available_colors: [...(p.available_colors||[]), { name: rawName, hex: '' }]})); }}
                          className={`relative w-14 h-14 rounded border-2 overflow-hidden transition-all ${alreadyAdded ? 'border-green-500 opacity-60' : 'border-border hover:border-primary'}`}>
                          <img src={url} alt={rawName} className="w-full h-full object-contain bg-white" />
                          {alreadyAdded && <span className="absolute inset-0 flex items-center justify-center bg-green-500/20 text-green-700 text-lg">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Input placeholder="Color name" value={colorNameInput} onChange={e => setColorNameInput(e.target.value)} />
                <input type="color" value={colorHexInput} onChange={e => setColorHexInput(e.target.value)} className="h-9 w-12 rounded border border-input cursor-pointer" />
                <Button type="button" variant="outline" onClick={() => { if (colorNameInput.trim()) { setFormData(p => ({...p, available_colors: [...(p.available_colors||[]), {name: colorNameInput.trim(), hex: colorHexInput}]})); setColorNameInput(''); setColorHexInput('#000000'); } }}>Add</Button>
              </div>
            </div>

            {/* Customer-visible info */}
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label>Shipping / Production Note <span className="text-xs text-muted-foreground">(shown on product page)</span></Label>
                <Input value={formData.shipping_note} onChange={e => setFormData(p => ({...p, shipping_note: e.target.value}))} placeholder="e.g. Ships in 5-7 business days" className="mt-1" />
              </div>
              <div>
                <Label>Care Instructions <span className="text-xs text-muted-foreground">(shown on product page)</span></Label>
                <Input value={formData.care_instructions} onChange={e => setFormData(p => ({...p, care_instructions: e.target.value}))} placeholder="e.g. Machine wash cold, tumble dry low" className="mt-1" />
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label>Tags <span className="text-xs text-muted-foreground">(comma-separated)</span></Label>
              <Input
                value={(formData.tags || []).join(', ')}
                onChange={e => setFormData(p => ({...p, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)}))}
                placeholder="e.g. summer, classic, custom"
                className="mt-1"
              />
            </div>

            {/* S&S Activewear Details (if applicable) */}
            {editingProduct?.vendor_source === 'S&S Activewear' && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-purple-800 uppercase tracking-wider">S&S Activewear Details</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor</p>
                    <p className="font-medium">S&S Activewear</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Brand</p>
                    <p className="font-medium">{formData.tags?.[0] || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Style Number</p>
                    <p className="font-medium">{formData.supplier_sku || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Blank Cost</p>
                    <p className="font-medium">${parseFloat(formData.blank_garment_cost || 0).toFixed(2)}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Available Sizes</p>
                    <p className="font-medium text-sm">{(formData.available_sizes || []).join(', ') || '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Available Colors</p>
                    <p className="font-medium text-sm">{(formData.available_colors || []).map(c => c.name).join(', ') || '—'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Admin-only fields */}
            <div className="bg-primary/[0.03] border border-primary/20 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-primary uppercase tracking-wider">Admin Only — Vendor & Cost Info</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Supplier SKU</Label>
                  <Input value={formData.supplier_sku} onChange={e => setFormData(p => ({...p, supplier_sku: e.target.value}))} placeholder="e.g. BC3001" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Vendor Source</Label>
                  <Input value={formData.vendor_source} onChange={e => setFormData(p => ({...p, vendor_source: e.target.value}))} placeholder="e.g. Bella+Canvas" className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Blank Garment Cost ($)</Label>
                  <Input type="number" step="0.01" min="0" value={formData.blank_garment_cost} onChange={e => setFormData(p => ({...p, blank_garment_cost: e.target.value}))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Print Cost Estimate ($)</Label>
                  <Input type="number" step="0.01" min="0" value={formData.print_cost_estimate} onChange={e => setFormData(p => ({...p, print_cost_estimate: e.target.value}))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Total Vendor Cost ($)</Label>
                  <Input type="number" step="0.01" min="0" value={formData.vendor_cost} onChange={e => setFormData(p => ({...p, vendor_cost: e.target.value}))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Profit Estimate ($)</Label>
                  <Input type="number" step="0.01" value={formData.profit_estimate} onChange={e => setFormData(p => ({...p, profit_estimate: e.target.value}))} className="mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Vendor Pricing Record ID</Label>
                <Input value={formData.vendor_pricing_id} onChange={e => setFormData(p => ({...p, vendor_pricing_id: e.target.value}))} placeholder="VendorPricing record ID" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Internal Notes</Label>
                <Textarea value={formData.internal_notes} onChange={e => setFormData(p => ({...p, internal_notes: e.target.value}))} rows={2} placeholder="Admin notes — never shown to customers" className="mt-1 text-sm" />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isUploading || createMutation.isPending || updateMutation.isPending}>
                {editingProduct ? 'Update Product' : 'Create Product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
