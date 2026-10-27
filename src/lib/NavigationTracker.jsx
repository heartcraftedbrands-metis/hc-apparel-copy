import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { base44 } from '@/api/base44Client';
import { pagesConfig } from '@/pages.config';
import { disablePublicPixels, getMarketingSessionId, isPrivateMarketingRoute, trackMarketingEvent } from '@/lib/marketingAnalytics';

export default function NavigationTracker() {
    const location = useLocation();
    const { isAuthenticated, isLoadingAuth, user } = useAuth();
    const { Pages, mainPage } = pagesConfig;
    const mainPageKey = mainPage ?? Object.keys(Pages)[0];

    useLayoutEffect(() => {
        if (isPrivateMarketingRoute(location.pathname)) disablePublicPixels();
    }, [location.pathname]);

    useEffect(() => {
        // Do not emit an anonymous event while an existing staff session is
        // still being restored. The server also enforces the authenticated
        // role, but waiting here prevents the initial client race entirely.
        if (isLoadingAuth) return;
        if (!isPrivateMarketingRoute(location.pathname)) {
            const isStaff = ['admin', 'operations_manager'].includes(user?.role);
            const eventOptions = eventName => ({
                internal: isStaff,
                context: { actor_scope: isStaff ? 'staff' : isAuthenticated ? 'authenticated_customer' : 'anonymous' },
                dedupeKey: `${eventName}:${getMarketingSessionId() || 'unavailable'}:${location.key}`,
            });
            void trackMarketingEvent('page_view', null, 'navigation', eventOptions('page_view'));
            if (location.pathname.toLowerCase() === '/productdetail' && new URLSearchParams(location.search).get('preview') !== 'draft') {
                const id = new URLSearchParams(location.search).get('id');
                if (id) void trackMarketingEvent('product_view', { id }, 'product_detail', eventOptions('product_view'));
            }
            if (location.pathname.toLowerCase().startsWith('/brand/')) void trackMarketingEvent('brand_view', null, 'brand_page', eventOptions('brand_view'));
            if (location.pathname.toLowerCase() === '/shopgarments') {
                const options = eventOptions('category_view');
                void trackMarketingEvent('category_view', null, 'shop_garments', { ...options, context: { ...options.context, category: new URLSearchParams(location.search).get('category') || 'all_garments' } });
            }
        }
    }, [location.pathname, location.search, location.key, isAuthenticated, isLoadingAuth, user?.role]);

    // App activity logging is separate so authentication changes do not duplicate marketing events.
    useEffect(() => {
        // Extract page name from pathname
        const pathname = location.pathname;
        let pageName;

        if (pathname === '/' || pathname === '') {
            pageName = mainPageKey;
        } else {
            // Remove leading slash and get the first segment
            const pathSegment = pathname.replace(/^\//, '').split('/')[0];

            // Try case-insensitive lookup in Pages config
            const pageKeys = Object.keys(Pages);
            const matchedKey = pageKeys.find(
                key => key.toLowerCase() === pathSegment.toLowerCase()
            );

            pageName = matchedKey || null;
        }

        if (isAuthenticated && pageName) {
            base44.appLogs.logUserInApp(pageName).catch(() => {
                // Silently fail - logging shouldn't break the app
            });
        }
    }, [location.pathname, isAuthenticated, Pages, mainPageKey]);

    return null;
}
