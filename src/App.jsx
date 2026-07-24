import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';

// Public pages
import HomePage from './pages/Home';
import ShopGarmentsPage from './pages/ShopGarments';
import CustomPrintingPage from './pages/CustomPrinting';
import PrintSupportPage from './pages/PrintSupport';
import AboutPage from './pages/About';
import FAQPage from './pages/FAQ';
import ContactPage from './pages/Contact';
import ProfilePage from './pages/Profile';
import WishlistPage from './pages/Wishlist';
import ProductDetailPage from './pages/ProductDetail';
import CheckoutPage from './pages/Checkout';
import OrderConfirmationPage from './pages/OrderConfirmation';
import LoginPage from './pages/Login';
import ResetPasswordPage from './pages/ResetPassword';
import RequestOrderHelpPage from './pages/RequestOrderHelp';

// Admin pages
import AdminDashboard from './pages/AdminDashboard';
import AdminProducts from './pages/AdminProducts';
import AdminDigitalArchive from './pages/AdminDigitalArchive';
import AdminOrders from './pages/AdminOrders';
import AdminVendors from './pages/AdminVendors';
import AdminVendorDetail from './pages/AdminVendorDetail';
import AdminVendorPricing from './pages/AdminVendorPricing';
import AdminVendorOrders from './pages/AdminVendorOrders';
import AdminQuotes from './pages/AdminQuotes';
import AdminProfitCalc from './pages/AdminProfitCalc';
import AdminAnalytics from './pages/AdminAnalytics';
import RequestQuotePage from './pages/RequestQuote';
import AdminQuoteRequests from './pages/AdminQuoteRequests';
import AdminQuoteRequestDetail from './pages/AdminQuoteRequestDetail';
import AdminOrderDetail from './pages/AdminOrderDetail';
import AdminSSCatalog from './pages/AdminSSCatalog';
import AdminSSApiSettings from './pages/AdminSSApiSettings';
import AdminQATestReport from './pages/AdminQATestReport';
import AdminVendorOrderDetail from './pages/AdminVendorOrderDetail';
import AdminVendorOrderTest from './pages/AdminVendorOrderTest';
import AdminPaymentSettings from './pages/AdminPaymentSettings';
import AdminPaymentFeeSettings from './pages/AdminPaymentFeeSettings';
import AdminCustomerNotifications from './pages/AdminCustomerNotifications';
import AdminOperationsDashboard from './pages/AdminOperationsDashboard';
import AdminSSPricingRules from './pages/AdminSSPricingRules';
import AdminSSImportAudit from './pages/AdminSSImportAudit';
import AdminSSDraftProductTest from './pages/AdminSSDraftProductTest';
import AdminSSStagedImport from './pages/AdminSSStagedImport';
import AdminSSSkuReview from './pages/AdminSSSkuReview';
import AdminSSPricingPreview from './pages/AdminSSPricingPreview';
import AdminSSPricingExceptions from './pages/AdminSSPricingExceptions';
import AdminSSDraftReview from './pages/AdminSSDraftReview';
import AdminSSLaunchBatch from './pages/AdminSSLaunchBatch';
import AdminSSLaunchQA from './pages/AdminSSLaunchQA';
import AdminSSPostPublishQA from './pages/AdminSSPostPublishQA';
import AdminVendorCatalogImport from './pages/AdminVendorCatalogImport';
import AdminVendorCatalogReview from './pages/AdminVendorCatalogReview';
import AdminGarmentCatalog from './pages/AdminGarmentCatalog';
import AdminGarmentLoader from './pages/AdminGarmentLoader';
import TrackOrder from './pages/TrackOrder';
import LaunchQAReport from './pages/LaunchQAReport';
import LaunchReadinessQA from './pages/LaunchReadinessQA';
import MissingImageReport from './pages/MissingImageReport';
import AdminContactMessages from './pages/AdminContactMessages';
import AdminInbox from './pages/AdminInbox';
import AdminVendorOrderDraftDetail from './pages/AdminVendorOrderDraftDetail';
import AdminVendorOrderDraft from './pages/AdminVendorOrderDraft';
import AdminMessageTemplates from './pages/AdminMessageTemplates';
import PublicCatalogAudit from './pages/PublicCatalogAudit';

const { Layout } = pagesConfig;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Routes>
      {/* Home */}
      <Route path="/" element={<LayoutWrapper currentPageName="Home"><HomePage /></LayoutWrapper>} />

      {/* Public store */}
      <Route path="/ShopGarments" element={<LayoutWrapper currentPageName="ShopGarments"><ShopGarmentsPage /></LayoutWrapper>} />
      <Route path="/CustomPrinting" element={<LayoutWrapper currentPageName="CustomPrinting"><CustomPrintingPage /></LayoutWrapper>} />
      <Route path="/PrintSupport" element={<LayoutWrapper currentPageName="PrintSupport"><PrintSupportPage /></LayoutWrapper>} />
      <Route path="/About" element={<LayoutWrapper currentPageName="About"><AboutPage /></LayoutWrapper>} />
      <Route path="/FAQ" element={<LayoutWrapper currentPageName="FAQ"><FAQPage /></LayoutWrapper>} />
      <Route path="/Contact" element={<LayoutWrapper currentPageName="Contact"><ContactPage /></LayoutWrapper>} />
      <Route path="/ProductDetail" element={<LayoutWrapper currentPageName="ProductDetail"><ProductDetailPage /></LayoutWrapper>} />
      <Route path="/Checkout" element={<LayoutWrapper currentPageName="Checkout"><CheckoutPage /></LayoutWrapper>} />
      <Route path="/OrderConfirmation" element={<LayoutWrapper currentPageName="OrderConfirmation"><OrderConfirmationPage /></LayoutWrapper>} />
      <Route path="/Profile" element={<LayoutWrapper currentPageName="Profile"><ProfilePage /></LayoutWrapper>} />
      <Route path="/Wishlist" element={<LayoutWrapper currentPageName="Wishlist"><WishlistPage /></LayoutWrapper>} />
      <Route path="/RequestQuote" element={<LayoutWrapper currentPageName="RequestQuote"><RequestQuotePage /></LayoutWrapper>} />
      <Route path="/RequestOrderHelp" element={<LayoutWrapper currentPageName="RequestOrderHelp"><RequestOrderHelpPage /></LayoutWrapper>} />
      <Route path="/TrackOrder" element={<LayoutWrapper currentPageName="TrackOrder"><TrackOrder /></LayoutWrapper>} />
      <Route path="/Login" element={<LayoutWrapper currentPageName="Login"><LoginPage /></LayoutWrapper>} />
      <Route path="/ResetPassword" element={<LayoutWrapper currentPageName="ResetPassword"><ResetPasswordPage /></LayoutWrapper>} />

      <Route element={<ProtectedRoute requiredRole="admin" />}>
      {/* Admin */}
      <Route path="/AdminDashboard" element={<LayoutWrapper currentPageName="AdminDashboard"><AdminDashboard /></LayoutWrapper>} />
      <Route path="/AdminProducts" element={<LayoutWrapper currentPageName="AdminProducts"><AdminProducts /></LayoutWrapper>} />
      <Route path="/AdminDigitalArchive" element={<LayoutWrapper currentPageName="AdminDigitalArchive"><AdminDigitalArchive /></LayoutWrapper>} />
      <Route path="/AdminOrders" element={<LayoutWrapper currentPageName="AdminOrders"><AdminOrders /></LayoutWrapper>} />
      <Route path="/AdminVendors" element={<LayoutWrapper currentPageName="AdminVendors"><AdminVendors /></LayoutWrapper>} />
      <Route path="/AdminVendorDetail" element={<LayoutWrapper currentPageName="AdminVendorDetail"><AdminVendorDetail /></LayoutWrapper>} />
      <Route path="/AdminVendorPricing" element={<LayoutWrapper currentPageName="AdminVendorPricing"><AdminVendorPricing /></LayoutWrapper>} />
      <Route path="/AdminVendorOrders" element={<LayoutWrapper currentPageName="AdminVendorOrders"><AdminVendorOrders /></LayoutWrapper>} />
      <Route path="/AdminQuotes" element={<LayoutWrapper currentPageName="AdminQuotes"><AdminQuotes /></LayoutWrapper>} />
      <Route path="/AdminProfitCalc" element={<LayoutWrapper currentPageName="AdminProfitCalc"><AdminProfitCalc /></LayoutWrapper>} />
      <Route path="/AdminAnalytics" element={<LayoutWrapper currentPageName="AdminAnalytics"><AdminAnalytics /></LayoutWrapper>} />
      <Route path="/AdminQuoteRequests" element={<LayoutWrapper currentPageName="AdminQuoteRequests"><AdminQuoteRequests /></LayoutWrapper>} />
      <Route path="/AdminQuoteRequestDetail" element={<LayoutWrapper currentPageName="AdminQuoteRequestDetail"><AdminQuoteRequestDetail /></LayoutWrapper>} />
      <Route path="/AdminOrderDetail" element={<LayoutWrapper currentPageName="AdminOrderDetail"><AdminOrderDetail /></LayoutWrapper>} />
      <Route path="/AdminSSCatalog" element={<LayoutWrapper currentPageName="AdminSSCatalog"><AdminSSCatalog /></LayoutWrapper>} />
      <Route path="/AdminSSApiSettings" element={<LayoutWrapper currentPageName="AdminSSApiSettings"><AdminSSApiSettings /></LayoutWrapper>} />
      <Route path="/AdminQATestReport" element={<LayoutWrapper currentPageName="AdminQATestReport"><AdminQATestReport /></LayoutWrapper>} />
      <Route path="/AdminVendorOrderDetail" element={<LayoutWrapper currentPageName="AdminVendorOrderDetail"><AdminVendorOrderDetail /></LayoutWrapper>} />
      <Route path="/AdminVendorOrderTest" element={<LayoutWrapper currentPageName="AdminVendorOrderTest"><AdminVendorOrderTest /></LayoutWrapper>} />
      <Route path="/AdminPaymentSettings" element={<LayoutWrapper currentPageName="AdminPaymentSettings"><AdminPaymentSettings /></LayoutWrapper>} />
      <Route path="/AdminPaymentFeeSettings" element={<LayoutWrapper currentPageName="AdminPaymentFeeSettings"><AdminPaymentFeeSettings /></LayoutWrapper>} />
      <Route path="/AdminCustomerNotifications" element={<LayoutWrapper currentPageName="AdminCustomerNotifications"><AdminCustomerNotifications /></LayoutWrapper>} />
      <Route path="/AdminOperationsDashboard" element={<LayoutWrapper currentPageName="AdminOperationsDashboard"><AdminOperationsDashboard /></LayoutWrapper>} />
      <Route path="/AdminSSPricingRules" element={<LayoutWrapper currentPageName="AdminSSPricingRules"><AdminSSPricingRules /></LayoutWrapper>} />
      <Route path="/AdminSSImportAudit" element={<LayoutWrapper currentPageName="AdminSSImportAudit"><AdminSSImportAudit /></LayoutWrapper>} />
      <Route path="/AdminSSDraftProductTest" element={<LayoutWrapper currentPageName="AdminSSDraftProductTest"><AdminSSDraftProductTest /></LayoutWrapper>} />
      <Route path="/AdminSSStagedImport" element={<LayoutWrapper currentPageName="AdminSSStagedImport"><AdminSSStagedImport /></LayoutWrapper>} />
      <Route path="/AdminSSSkuReview" element={<LayoutWrapper currentPageName="AdminSSSkuReview"><AdminSSSkuReview /></LayoutWrapper>} />
      <Route path="/AdminSSPricingPreview" element={<LayoutWrapper currentPageName="AdminSSPricingPreview"><AdminSSPricingPreview /></LayoutWrapper>} />
      <Route path="/AdminSSPricingExceptions" element={<LayoutWrapper currentPageName="AdminSSPricingExceptions"><AdminSSPricingExceptions /></LayoutWrapper>} />
      <Route path="/AdminSSDraftReview" element={<LayoutWrapper currentPageName="AdminSSDraftReview"><AdminSSDraftReview /></LayoutWrapper>} />
      <Route path="/AdminSSLaunchBatch" element={<LayoutWrapper currentPageName="AdminSSLaunchBatch"><AdminSSLaunchBatch /></LayoutWrapper>} />
      <Route path="/AdminSSLaunchQA" element={<LayoutWrapper currentPageName="AdminSSLaunchQA"><AdminSSLaunchQA /></LayoutWrapper>} />
      <Route path="/AdminSSPostPublishQA" element={<LayoutWrapper currentPageName="AdminSSPostPublishQA"><AdminSSPostPublishQA /></LayoutWrapper>} />
      <Route path="/AdminGarmentCatalog" element={<LayoutWrapper currentPageName="AdminGarmentCatalog"><AdminGarmentCatalog /></LayoutWrapper>} />
      <Route path="/AdminGarmentLoader" element={<LayoutWrapper currentPageName="AdminGarmentLoader"><AdminGarmentLoader /></LayoutWrapper>} />
      <Route path="/AdminVendorCatalogImport" element={<LayoutWrapper currentPageName="AdminVendorCatalogImport"><AdminVendorCatalogImport /></LayoutWrapper>} />
      <Route path="/AdminVendorCatalogReview" element={<LayoutWrapper currentPageName="AdminVendorCatalogReview"><AdminVendorCatalogReview /></LayoutWrapper>} />

      <Route path="/LaunchQAReport" element={<LayoutWrapper currentPageName="LaunchQAReport"><LaunchQAReport /></LayoutWrapper>} />
      <Route path="/LaunchReadinessQA" element={<LayoutWrapper currentPageName="LaunchReadinessQA"><LaunchReadinessQA /></LayoutWrapper>} />
      <Route path="/MissingImageReport" element={<LayoutWrapper currentPageName="MissingImageReport"><MissingImageReport /></LayoutWrapper>} />
      <Route path="/AdminContactMessages" element={<LayoutWrapper currentPageName="AdminContactMessages"><AdminContactMessages /></LayoutWrapper>} />
      <Route path="/AdminInbox" element={<LayoutWrapper currentPageName="AdminInbox"><AdminInbox /></LayoutWrapper>} />
      <Route path="/AdminVendorOrderDraftDetail" element={<LayoutWrapper currentPageName="AdminVendorOrderDraftDetail"><AdminVendorOrderDraftDetail /></LayoutWrapper>} />
      <Route path="/AdminVendorOrderDraft" element={<LayoutWrapper currentPageName="AdminVendorOrderDraft"><AdminVendorOrderDraft /></LayoutWrapper>} />
      <Route path="/AdminMessageTemplates" element={<LayoutWrapper currentPageName="AdminMessageTemplates"><AdminMessageTemplates /></LayoutWrapper>} />
      <Route path="/PublicCatalogAudit" element={<LayoutWrapper currentPageName="PublicCatalogAudit"><PublicCatalogAudit /></LayoutWrapper>} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
