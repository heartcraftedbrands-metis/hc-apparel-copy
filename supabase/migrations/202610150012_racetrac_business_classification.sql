begin;

-- The owner reviewed this posted RaceTrac transaction and classified the spend
-- as business. The detailed expense category remains deliberately unresolved:
-- no fuel account is assumed and the transaction stays in the review queue.
update public.ops_financial_transactions
set chart_account_id = null,
    suggested_chart_account_id = null,
    category_source = 'manual',
    category_confidence = 1.000,
    categorization_explanation = 'Owner classified the posted RaceTrac transaction as business spending; the detailed expense category remains unidentified.',
    categorization_rule_id = null,
    manual_category_override = true,
    spend_classification = 'business',
    review_status = 'review_needed',
    category_updated_at = now(),
    category_updated_by = null
where provider = 'stripe'
  and provider_transaction_id = 'trxn_65VZrfLw9IRQ8SJfwPT16VVewI8jSQktioeEIDXETLcCGO';

update public.ops_shared_records
set status = 'needs_review',
    sync_state = 'synced',
    payload = (payload - 'suggestedChartAccountId' - 'chartAccountId' - 'chartAccountCode') || jsonb_build_object(
      'category', 'Unclassified',
      'spendClassification', 'business',
      'reviewStatus', 'needs_review',
      'include_in_business_reporting', true,
      'linkedToTinaInvoice', false,
      'manualCategoryOverride', true,
      'categorizationExplanation', 'Owner classified the posted RaceTrac transaction as business spending; the detailed expense category remains unidentified.',
      'updatedAt', now()::text
    ),
    revision = revision + 1,
    updated_at = now()
where id = 'expense-racetrac-2329-20261014-254'
  and record_type = 'expense';

-- The receipt is the record where the owner's Business selection was already
-- saved. Keep that evidence aligned with the posted expense/reporting record.
update public.ops_shared_records
set sync_state = 'synced',
    payload = payload || jsonb_build_object(
      'category', 'Unclassified',
      'spendClassification', 'business',
      'include_in_business_reporting', true,
      'linkedToTinaInvoice', false,
      'manualCategoryOverride', true,
      'updatedAt', now()::text
    ),
    revision = revision + 1,
    updated_at = now()
where id = 'receipt-racetrac-2329-financial-account-20261014'
  and record_type = 'receipt';

commit;
