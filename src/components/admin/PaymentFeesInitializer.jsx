import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Initializes payment fee settings if they don't exist
 * Runs once on admin dashboard load
 */
export default function PaymentFeesInitializer() {
  useEffect(() => {
    const initialize = async () => {
      try {
        const existing = await base44.entities.PaymentFeeSettings.list();
        
        if (existing.length === 0) {
          // Create defaults
          await base44.entities.PaymentFeeSettings.create({
            stripe_fee_buffer_percent: 3.5,
            stripe_fixed_fee_buffer: 0.5,
            paypal_fee_buffer_percent: 4.0,
            paypal_fixed_fee_buffer: 0.5,
            additional_profit_buffer_percent: 0,
            price_rounding_mode: 'nearest_99',
            last_updated: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn('Failed to initialize payment fee settings:', err);
      }
    };

    initialize();
  }, []);

  return null; // This component doesn't render anything
}