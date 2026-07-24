import { supabase } from '@/api/supabaseClient';

const ENTITY_CONFIG = {
  Cart: { table: 'carts' },
  ContactMessage: { table: 'contact_messages' },
  CustomerNotification: { table: 'customer_notifications', customerView: 'customer_visible_notifications' },
  GarmentCatalog: { table: 'garment_catalog_items' },
  ImportBatch: { table: 'import_batches' },
  NewsletterSubscriber: { table: 'newsletter_subscribers' },
  Order: { table: 'orders', customerView: 'customer_orders' },
  OrderStatusHistory: { table: 'order_status_history' },
  ProductionStatusHistory: { table: 'production_status_history' },
  PaymentFeeSettings: { table: 'payment_fee_settings' },
  PaymentSettings: { table: 'payment_settings' },
  Product: { table: 'products', publicView: 'storefront_products' },
  Quote: { table: 'quotes' },
  QuoteRequest: { table: 'quote_requests' },
  Review: { table: 'reviews', publicView: 'storefront_reviews' },
  SSCatalogItem: { table: 'ss_catalog_items' },
  SSImportStaging: { table: 'ss_import_staging' },
  SSPricingRules: { table: 'ss_pricing_rules' },
  Vendor: { table: 'vendors' },
  VendorOrder: { table: 'vendor_orders' },
  VendorOrderDraft: { table: 'vendor_order_drafts' },
  VendorPricing: { table: 'vendor_pricing' },
  Wishlist: { table: 'wishlists' },
};

let profilePromise = null;

const asError = (error) => {
  const wrapped = new Error(error?.message || 'Supabase request failed');
  wrapped.status = error?.status || error?.code;
  wrapped.code = error?.code;
  wrapped.cause = error;
  return wrapped;
};

const requireData = ({ data, error }) => {
  if (error) throw asError(error);
  return data;
};

const currentProfile = async () => {
  if (!profilePromise) {
    profilePromise = (async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return null;
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id,email,full_name,role')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw asError(error);
      return { ...user, ...profile, role: profile?.role || 'customer' };
    })();
  }
  return profilePromise;
};

supabase.auth.onAuthStateChange(() => {
  profilePromise = null;
});

const readSource = async (config) => {
  if (!config.publicView && !config.customerView) return config.table;
  const profile = await currentProfile();
  if (profile?.role === 'admin') return config.table;
  return config.publicView || config.customerView || config.table;
};

const translateFilterKey = (entityName, key) => {
  if ((entityName === 'Cart' || entityName === 'Wishlist') && key === 'created_by') {
    return 'created_by_email';
  }
  return key;
};

const applyFilters = (query, entityName, filters = {}) => {
  let next = query;
  for (const [rawKey, value] of Object.entries(filters || {})) {
    if (value === undefined) continue;
    const key = translateFilterKey(entityName, rawKey);
    if (value === null) {
      next = next.is(key, null);
    } else if (Array.isArray(value)) {
      next = next.in(key, value);
    } else if (typeof value === 'object' && value.$in) {
      next = next.in(key, value.$in);
    } else if (typeof value === 'object' && value.$ne !== undefined) {
      next = next.neq(key, value.$ne);
    } else {
      next = next.eq(key, value);
    }
  }
  return next;
};

const applySort = (query, sort) => {
  if (!sort) return query;
  return String(sort).split(',').reduce((next, item) => {
    const field = item.trim();
    if (!field) return next;
    const descending = field.startsWith('-');
    return next.order(descending ? field.slice(1) : field, { ascending: !descending });
  }, query);
};

const normalizeRecord = (entityName, record) => {
  if (!record) return record;
  if ((entityName === 'Cart' || entityName === 'Wishlist') && !record.created_by) {
    return { ...record, created_by: record.created_by_email };
  }
  return record;
};

const prepareWrite = async (entityName, values) => {
  const payload = { ...values };
  const { data: { user } } = await supabase.auth.getUser();
  if (entityName === 'Cart' || entityName === 'Wishlist') {
    if (payload.created_by && !payload.created_by_email) {
      payload.created_by_email = payload.created_by;
    }
    delete payload.created_by;
  }
  if (user) {
    payload.owner_user_id ??= user.id;
    payload.created_by_email ??= user.email;
  }
  return payload;
};

const createEntityApi = (entityName) => {
  const config = ENTITY_CONFIG[entityName];
  if (!config) throw new Error(`Unknown migrated entity: ${entityName}`);

  const fetchMany = async (filters, sort, limit = 1000, offset = 0) => {
    const source = await readSource(config);
    let query = supabase.from(source).select('*');
    query = applyFilters(query, entityName, filters);
    query = applySort(query, sort);
    if (limit) query = query.range(offset, offset + limit - 1);
    const rows = requireData(await query) || [];
    return rows.map((row) => normalizeRecord(entityName, row));
  };

  return {
    list: (sort, limit, offset = 0) => fetchMany({}, sort, limit, offset),
    filter: (filters, sort, limit, offset = 0) => fetchMany(filters, sort, limit, offset),
    get: async (id) => {
      const source = await readSource(config);
      const row = requireData(await supabase.from(source).select('*').eq('id', id).single());
      return normalizeRecord(entityName, row);
    },
    create: async (values) => {
      const payload = await prepareWrite(entityName, values);
      const row = requireData(
        await supabase.from(config.table).insert(payload).select('*').single(),
      );
      return normalizeRecord(entityName, row);
    },
    update: async (id, values) => {
      const payload = await prepareWrite(entityName, values);
      const row = requireData(
        await supabase.from(config.table).update(payload).eq('id', id).select('*').single(),
      );
      return normalizeRecord(entityName, row);
    },
    delete: async (id) => requireData(
      await supabase.from(config.table).delete().eq('id', id).select('*').maybeSingle(),
    ),
  };
};

const entities = new Proxy({}, {
  get: (target, entityName) => {
    if (!target[entityName]) target[entityName] = createEntityApi(entityName);
    return target[entityName];
  },
});

const auth = {
  me: async () => {
    const profile = await currentProfile();
    if (!profile) {
      const error = new Error('Authentication required');
      error.status = 401;
      throw error;
    }
    return profile;
  },
  logout: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw asError(error);
    window.location.assign('/');
  },
  redirectToLogin: (returnTo = window.location.href) => {
    sessionStorage.setItem('hc_login_return_to', returnTo);
    window.location.assign('/Login');
  },
};

const functions = {
  invoke: async (name, body = {}) => {
    const rpc = {
      submitContactMessage: ['submit_contact_message', { payload: body }],
      submitOrderHelpRequest: ['submit_order_help_request', { payload: body }],
      submitQuoteRequest: ['submit_quote_request', { payload: body }],
      subscribeNewsletter: ['subscribe_newsletter', { subscriber_email: body.email }],
      trackOrder: ['track_order', { order_fragment: body.order_number, customer_email: body.email }],
    }[name];
    if (rpc) {
      const data = requireData(await supabase.rpc(rpc[0], rpc[1]));
      return { data };
    }
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw asError(error);
    return { data };
  },
};

const integrations = {
  Core: {
    UploadFile: async ({ file, bucket = 'customer-files' }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
      const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-');
      const path = `uploads/${user.id}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
      if (error) throw asError(error);
      if (bucket === 'storefront-assets') {
        return { file_url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl };
      }
      return { file_url: `supabase://${bucket}/${path}` };
    },
    SendEmail: async () => {
      throw new Error('Email delivery is not migrated to Supabase yet');
    },
  },
};

export const base44 = {
  auth,
  entities,
  functions,
  integrations,
  appLogs: { logUserInApp: async () => undefined },
};
