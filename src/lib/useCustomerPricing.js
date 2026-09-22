import { useAuth } from '@/lib/AuthContext';
import { normalizePublicVisitorPricing, publicVisitorPrice } from '@/lib/customerPricing';

export function useCustomerPricing() {
  const { isAuthenticated, publicPricingSettings } = useAuth();
  const settings = normalizePublicVisitorPricing(publicPricingSettings);
  const displayPrice = (customerPrice, product = {}) => (
    isAuthenticated ? Number(customerPrice) : publicVisitorPrice(customerPrice, settings, product)
  );
  return { isAuthenticated, settings, displayPrice, customerPriceLabel: 'HC Apparel customer price' };
}
