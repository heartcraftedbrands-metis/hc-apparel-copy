import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Plus, Trash2, Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const ROUNDING_MODES = [
  { value: 'none', label: 'No rounding ($5.30)' },
  { value: 'nearest_tenth', label: 'Nearest dime ($5.30)' },
  { value: 'nearest_half', label: 'Nearest 50¢ ($5.50)' },
  { value: 'round_up', label: 'Round up ($5.50)' }
];

const APPROVED_BRANDS = [
  'Bella + Canvas',
  'Gildan',
  'Comfort Colors',
  'Next Level',
  'Independent Trading Co.',
  'Champion',
  'Hanes',
  'Rabbit Skins',
  'Shaka Wear',
  'Lane Seven',
  'adidas'
];

const CATEGORIES = [
  'T-Shirts',
  'Hoodies',
  'Sweatshirts',
  'Tanks',
  'Kids Apparel',
  'Hats',
  'Apparel Blanks'
];

export default function AdminSSPricingRules() {
  const qc = useQueryClient();
  const [formData, setFormData] = useState({
    flat_markup_amount: 2.00,
    rounding_mode: 'none',
    minimum_price: 0,
    category_overrides: [],
    brand_overrides: [],
  });

  const [newCategoryOverride, setNewCategoryOverride] = useState('');
  const [newCategoryMarkup, setNewCategoryMarkup] = useState('');
  const [newBrandOverride, setNewBrandOverride] = useState('');
  const [newBrandMarkup, setNewBrandMarkup] = useState('');

  const { data: rules, isLoading } = useQuery({
    queryKey: ['ss-pricing-rules'],
    queryFn: async () => {
      const result = await base44.entities.SSPricingRules.list('-created_date', 1);
      return result[0] || null;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (rules?.id) {
        return base44.entities.SSPricingRules.update(rules.id, {
          ...data,
          last_updated: new Date().toISOString()
        });
      } else {
        return base44.entities.SSPricingRules.create({
          ...data,
          last_updated: new Date().toISOString()
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries(['ss-pricing-rules']);
      toast.success('Pricing rules saved!');
    },
    onError: (err) => {
      toast.error(`Error: ${err.message}`);
    }
  });

  useEffect(() => {
    if (rules) {
      setFormData({
        flat_markup_amount: rules.flat_markup_amount || 2.00,
        rounding_mode: rules.rounding_mode || 'none',
        minimum_price: rules.minimum_price || 0,
        category_overrides: rules.category_overrides || [],
        brand_overrides: rules.brand_overrides || [],
      });
    }
  }, [rules]);

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const addCategoryOverride = () => {
    if (!newCategoryOverride || !newCategoryMarkup) {
      toast.error('Select category and enter markup');
      return;
    }
    const exists = formData.category_overrides.find(o => o.category === newCategoryOverride);
    if (exists) {
      toast.error('Category already has an override');
      return;
    }
    setFormData(prev => ({
      ...prev,
      category_overrides: [
        ...prev.category_overrides,
        { category: newCategoryOverride, markup_amount: parseFloat(newCategoryMarkup) }
      ]
    }));
    setNewCategoryOverride('');
    setNewCategoryMarkup('');
  };

  const removeCategoryOverride = (idx) => {
    setFormData(prev => ({
      ...prev,
      category_overrides: prev.category_overrides.filter((_, i) => i !== idx)
    }));
  };

  const addBrandOverride = () => {
    if (!newBrandOverride || !newBrandMarkup) {
      toast.error('Select brand and enter markup');
      return;
    }
    const exists = formData.brand_overrides.find(o => o.brand === newBrandOverride);
    if (exists) {
      toast.error('Brand already has an override');
      return;
    }
    setFormData(prev => ({
      ...prev,
      brand_overrides: [
        ...prev.brand_overrides,
        { brand: newBrandOverride, markup_amount: parseFloat(newBrandMarkup) }
      ]
    }));
    setNewBrandOverride('');
    setNewBrandMarkup('');
  };

  const removeBrandOverride = (idx) => {
    setFormData(prev => ({
      ...prev,
      brand_overrides: prev.brand_overrides.filter((_, i) => i !== idx)
    }));
  };

  // Demo calculation
  const demoBlankCost = 3.30;
  const basedOnFlatMarkup = demoBlankCost + formData.flat_markup_amount;
  let demoPrice = basedOnFlatMarkup;
  if (formData.rounding_mode === 'nearest_half') demoPrice = Math.ceil(basedOnFlatMarkup * 2) / 2;
  else if (formData.rounding_mode === 'round_up') demoPrice = Math.ceil(basedOnFlatMarkup);
  if (formData.minimum_price > 0) demoPrice = Math.max(demoPrice, formData.minimum_price);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pt-20 md:pt-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
          <DollarSign className="w-8 h-8 text-accent" />
          S&S Pricing Rules
        </h1>
        <p className="text-slate-600 mt-1">Configure markup, rounding, minimums, and category/brand overrides</p>
      </div>

      {/* Default Markup */}
      <Card>
        <CardHeader>
          <CardTitle>📊 Default Pricing Rule</CardTitle>
          <CardDescription>
            Applied to all S&S products unless overridden by category or brand
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Flat Markup */}
            <div className="space-y-2">
              <Label htmlFor="flat_markup">Flat Markup Amount ($)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  id="flat_markup"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.flat_markup_amount}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    flat_markup_amount: parseFloat(e.target.value) || 0
                  }))}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Added to blank cost. Default: $2.00
              </p>
            </div>

            {/* Rounding Mode */}
            <div className="space-y-2">
              <Label htmlFor="rounding">Rounding Mode</Label>
              <Select value={formData.rounding_mode} onValueChange={(val) => setFormData(prev => ({ ...prev, rounding_mode: val }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROUNDING_MODES.map(mode => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How to round final price after markup
              </p>
            </div>

            {/* Minimum Price */}
            <div className="space-y-2">
              <Label htmlFor="min_price">Minimum Public Price ($)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  id="min_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.minimum_price}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    minimum_price: parseFloat(e.target.value) || 0
                  }))}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                0 = disabled. Price won't go below this.
              </p>
            </div>
          </div>

          {/* Demo */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">💡 Demo Calculation</p>
            <div className="text-sm text-blue-800 space-y-1">
              <p>If blank cost is <strong>${demoBlankCost}</strong></p>
              <p>+ Markup: <strong>${formData.flat_markup_amount}</strong></p>
              <p>= <strong>${basedOnFlatMarkup.toFixed(2)}</strong></p>
              {formData.rounding_mode !== 'none' && (
                <p>After rounding: <strong>${(demoPrice).toFixed(2)}</strong></p>
              )}
              {formData.minimum_price > 0 && (
                <p>After minimum ({formData.minimum_price}): <strong>${Math.max(demoPrice, formData.minimum_price).toFixed(2)}</strong></p>
              )}
              <p className="pt-2 border-t border-blue-300 mt-2">
                <strong>Final Public Price: ${demoPrice.toFixed(2)}</strong>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>🏷️ Category Overrides</CardTitle>
          <CardDescription>
            Override flat markup for specific categories
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.category_overrides.length > 0 && (
            <div className="space-y-2">
              {formData.category_overrides.map((override, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-100 p-3 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{override.category}</Badge>
                    <span className="text-sm font-medium">${override.markup_amount} markup</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeCategoryOverride(idx)}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Add Override</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Select value={newCategoryOverride} onValueChange={setNewCategoryOverride}>
                <SelectTrigger>
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter(cat => !formData.category_overrides.find(o => o.category === cat)).map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Markup"
                  value={newCategoryMarkup}
                  onChange={(e) => setNewCategoryMarkup(e.target.value)}
                />
              </div>
              <Button onClick={addCategoryOverride} size="sm" variant="outline" className="gap-1">
                <Plus className="w-4 h-4" /> Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Brand Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>🏢 Brand Overrides</CardTitle>
          <CardDescription>
            Override flat markup for specific approved brands
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.brand_overrides.length > 0 && (
            <div className="space-y-2">
              {formData.brand_overrides.map((override, idx) => (
                <div key={idx} className="flex items-center justify-between bg-slate-100 p-3 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{override.brand}</Badge>
                    <span className="text-sm font-medium">${override.markup_amount} markup</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeBrandOverride(idx)}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Add Override</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Select value={newBrandOverride} onValueChange={setNewBrandOverride}>
                <SelectTrigger>
                  <SelectValue placeholder="Brand" />
                </SelectTrigger>
                <SelectContent>
                  {APPROVED_BRANDS.filter(brand => !formData.brand_overrides.find(o => o.brand === brand)).map(brand => (
                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Markup"
                  value={newBrandMarkup}
                  onChange={(e) => setNewBrandMarkup(e.target.value)}
                />
              </div>
              <Button onClick={addBrandOverride} size="sm" variant="outline" className="gap-1">
                <Plus className="w-4 h-4" /> Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="pt-6 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-1">About these rules:</p>
            <ul className="list-disc list-inside space-y-1 text-amber-800">
              <li>Applied automatically when adding S&S product groups to public shop</li>
              <li>Each product variant gets its own price based on blank cost + markup</li>
              <li>Brand overrides take priority over category overrides over default markup</li>
              <li>Prices shown as "From $X" on product cards if variants have different prices</li>
              <li>Prices updated live when customer selects size/color on product detail</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={saveMutation.isPending}
        className="bg-primary hover:bg-primary/90 gap-2 w-full md:w-auto"
        size="lg"
      >
        <Save className="w-5 h-5" />
        {saveMutation.isPending ? 'Saving...' : 'Save Pricing Rules'}
      </Button>
    </div>
  );
}