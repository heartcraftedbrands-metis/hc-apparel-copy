import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { base44 } from '@/api/base44Client';
import { pagesConfig } from '@/pages.config';
import { loadPublicPixels, trackMarketingEvent } from '@/lib/marketingAnalytics';

export default function NavigationTracker() {
    const location = useLocation();
    const { isAuthenticated } = useAuth();
    const { Pages, mainPage } = pagesConfig;
    const mainPageKey = mainPage ?? Object.keys(Pages)[0];

    // Log user activity when navigating to a page
    useEffect(() => {
        if (!['/admin', '/launch', '/publiccatalogaudit', '/missingimagereport'].some(path => location.pathname.toLowerCase().startsWith(path))) {
            loadPublicPixels().then(() => trackMarketingEvent('page_view', null, location.pathname));
            if (location.pathname.toLowerCase() === '/productdetail') {
                const id = new URLSearchParams(location.search).get('id');
                if (id) trackMarketingEvent('view_product', { id }, 'product_detail');
            }
            if (location.pathname.toLowerCase() === '/checkout') trackMarketingEvent('begin_checkout', null, 'checkout');
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
