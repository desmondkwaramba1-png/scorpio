import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Footer from './components/Footer.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import OfflineScreen from './components/OfflineScreen.jsx';
import Marketplace from './pages/Marketplace.jsx';
import { titleForPath } from './lib/pageTitles';

// Route-based code splitting, on a slow connection, shipping the entire
// app (every dashboard page, every auth screen, the checkout flow) in one
// bundle before the very first page can render is real dead weight. Only
// Marketplace stays a normal eager import: it's overwhelmingly the first
// page a new visitor actually lands on, so there's nothing to gain by
// deferring it, everything reachable from a click loads on demand instead.
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Discover = lazy(() => import('./pages/Discover.jsx'));
const Creators = lazy(() => import('./pages/Creators.jsx'));
const Reels = lazy(() => import('./pages/Reels.jsx'));
const Blog = lazy(() => import('./pages/Blog.jsx'));
const BlogPost = lazy(() => import('./pages/BlogPost.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const OAuthComplete = lazy(() => import('./pages/OAuthComplete.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail.jsx'));
const CheckEmail = lazy(() => import('./pages/CheckEmail.jsx'));
const Terms = lazy(() => import('./pages/Terms.jsx'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy.jsx'));
const ReportIssue = lazy(() => import('./pages/ReportIssue.jsx'));
const AcceptTerms = lazy(() => import('./pages/AcceptTerms.jsx'));
const Onboarding = lazy(() => import('./pages/Onboarding.jsx'));
const Account = lazy(() => import('./pages/Account.jsx'));
const Product = lazy(() => import('./pages/Product.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const CartCheckout = lazy(() => import('./pages/CartCheckout.jsx'));
const PaymentReturn = lazy(() => import('./pages/PaymentReturn.jsx'));
const CreatorProfile = lazy(() => import('./pages/CreatorProfile.jsx'));
const CreatorReels = lazy(() => import('./pages/CreatorReels.jsx'));
const DashboardLayout = lazy(() => import('./pages/dashboard/DashboardLayout.jsx'));
const DashboardHome = lazy(() => import('./pages/dashboard/DashboardHome.jsx'));
const DashboardProducts = lazy(() => import('./pages/dashboard/Products.jsx'));
const DashboardOrders = lazy(() => import('./pages/dashboard/Orders.jsx'));
const DashboardNewProduct = lazy(() => import('./pages/dashboard/NewProduct.jsx'));
const DashboardEditProduct = lazy(() => import('./pages/dashboard/EditProduct.jsx'));
const DashboardProductIssues = lazy(() => import('./pages/dashboard/ProductIssues.jsx'));
const DashboardReels = lazy(() => import('./pages/dashboard/Reels.jsx'));
const DashboardInsights = lazy(() => import('./pages/dashboard/Insights.jsx'));
const DashboardWallet = lazy(() => import('./pages/dashboard/Wallet.jsx'));
const DashboardSubscriptions = lazy(() => import('./pages/dashboard/Subscriptions.jsx'));
const DashboardBlog = lazy(() => import('./pages/dashboard/Blog.jsx'));
const DashboardBlogEditor = lazy(() => import('./pages/dashboard/BlogEditor.jsx'));
const DashboardSettings = lazy(() => import('./pages/dashboard/Settings.jsx'));

function RouteFallback() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <div className="route-loading__mark" aria-hidden="true"><span /><span /><span /></div>
      <strong>Opening this page</strong>
      <p>Just a moment while we get it ready.</p>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    const title = titleForPath(pathname);
    if (title) document.title = title;
  }, [pathname]);

  const [connectionStatus, setConnectionStatus] = useState(() => navigator.onLine ? null : 'offline');
  const [checkingConnection, setCheckingConnection] = useState(false);

  useEffect(() => {
    const handleOffline = () => setConnectionStatus('offline');
    const handleOnline = () => setConnectionStatus(null);
    const handleConnectionError = () => setConnectionStatus(navigator.onLine ? 'unreachable' : 'offline');
    const handleConnectionRestored = () => setConnectionStatus(null);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('scorpio:connection-error', handleConnectionError);
    window.addEventListener('scorpio:connection-restored', handleConnectionRestored);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('scorpio:connection-error', handleConnectionError);
      window.removeEventListener('scorpio:connection-restored', handleConnectionRestored);
    };
  }, []);

  async function retryConnection() {
    setCheckingConnection(true);
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      if (!response.ok) throw new Error('API is unavailable');
      setConnectionStatus(null);
    } catch {
      setConnectionStatus(navigator.onLine ? 'unreachable' : 'offline');
    } finally {
      setCheckingConnection(false);
    }
  }

  return (
    <>
      <SplashScreen />
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Nav />
      <main id="main-content" tabIndex={-1}>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Marketplace />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/creators" element={<Creators />} />
            <Route path="/reels" element={<Reels />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            {/* No login/account guard on these — the real access control is
                routes/blog.js's own requireAdmin on every /api/blog/admin/*
                call (see AdminKeyGate.jsx), not this app's buyer/creator
                auth, which has nothing to do with who holds ADMIN_KEY. */}
            <Route path="/login" element={<Login />} />
            <Route path="/oauth-complete" element={<OAuthComplete />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/check-email" element={<CheckEmail />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/report" element={<ReportIssue />} />
            <Route path="/accept-terms" element={<AcceptTerms />} />
            <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute allowUnverified><Account /></ProtectedRoute>} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<CartCheckout />} />
            <Route path="/payment/return" element={<PaymentReturn />} />
            <Route
              path="/dashboard"
              element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}
            >
              <Route index element={<DashboardHome />} />
              <Route path="products" element={<DashboardProducts />} />
              <Route path="orders" element={<DashboardOrders />} />
              <Route path="products/new" element={<DashboardNewProduct />} />
              <Route path="products/:id/edit" element={<DashboardEditProduct />} />
              <Route path="products/:id/issues" element={<DashboardProductIssues />} />
              <Route path="reels" element={<DashboardReels />} />
              <Route path="insights" element={<DashboardInsights />} />
              <Route path="wallet" element={<DashboardWallet />} />
              <Route path="subscriptions" element={<DashboardSubscriptions />} />
              <Route path="blog" element={<DashboardBlog />} />
              <Route path="blog/new" element={<DashboardBlogEditor />} />
              <Route path="blog/:id/edit" element={<DashboardBlogEditor />} />
              <Route path="settings" element={<DashboardSettings />} />
            </Route>
            <Route path="/:handle/:slug/checkout" element={<Checkout />} />
            <Route path="/:handle/:slug" element={<Product />} />
            {/* Static "reels" segment always outranks :slug's dynamic
                match in React Router's route scoring, regardless of
                declaration order, and a product's slug can never
                literally be "reels" (slugify() always appends a random
                suffix, see products.js), so there's no real collision
                to guard against here the way creators.js's reserved-
                handle list guards the top-level /reels route. */}
            <Route path="/:handle/reels" element={<CreatorReels />} />
            <Route path="/:handle" element={<CreatorProfile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      </main>
      <Footer />
      {connectionStatus && <OfflineScreen
        status={connectionStatus}
        checking={checkingConnection}
        onRetry={retryConnection}
        onContinue={() => setConnectionStatus(null)}
      />}
    </>
  );
}
