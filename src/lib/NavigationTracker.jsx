import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { base44 } from '@/api/base44Client';
import { pagesConfig } from '@/pages.config';
import { disablePublicPixels, isPrivateMarketingRoute, trackMarketingEvent } from '@/lib/marketingAnalytics';

export default function NavigationTracker() {
    const location = useLocation();
    const { isAuthenticated } = useAuth();
    const { Pages, mainPage } = pagesConfig;
    const mainPageKey = mainPage ?? Object.keys(Pages)[0];

    useLayoutEffect(() => {
        if (isPrivateMarketingRoute(location.pathname)) disablePublicPixels();
    }, [location.pathname]);

    // Log user activity when navigating to a page
    useEffect(() => {
        if (!isPrivateMarketingRoute(location.pathname)) {
            void trackMarketingEvent('page_view', null, location.pathname);
            if (location.pathname.toLowerCase() === '/productdetail' && new URLSearchParams(location.search).get('preview') !== 'draft') {
                const id = new URLSearchParams(location.search).get('id');
                if (id) void trackMarketingEvent('view_product', { id }, 'product_detail');
            }
            if (location.pathname.toLowerCase() === '/checkout') void trackMarketingEvent('begin_checkout', null, 'checkout');
        }
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
    }, [location, isAuthenticated, Pages, mainPageKey]);

    return null;
}
