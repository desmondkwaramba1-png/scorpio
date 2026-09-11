import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Footer from './components/Footer.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Marketplace from './pages/Marketplace.jsx';

// Route-based code splitting, on a slow connection, shipping the entire
// app (every dashboard page, every auth screen, the checkout flow) in one
// bundle before the very first page can render is real dead weight. Only
// Marketplace stays a normal eager import: it's overwhelmingly the first
// page a new visitor actually lands on, so there's nothing to gain by
// deferring it, everything reachable from a click loads on demand instead.
const Discover = lazy(() => import('./pages/Discover.jsx'));
const Creators = lazy(() => import('./pages/Creators.jsx'));
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
const DashboardLayout = lazy(() => import('./pages/dashboard/DashboardLayout.jsx'));
const DashboardHome = lazy(() => import('./pages/dashboard/DashboardHome.jsx'));
const DashboardProducts = lazy(() => import('./pages/dashboard/Products.jsx'));
const DashboardOrders = lazy(() => import('./pages/dashboard/Orders.jsx'));
const DashboardNewProduct = lazy(() => import('./pages/dashboard/NewProduct.jsx'));
const DashboardEditProduct = lazy(() => import('./pages/dashboard/EditProduct.jsx'));
const DashboardReels = lazy(() => import('./pages/dashboard/Reels.jsx'));
const DashboardInsights = lazy(() => import('./pages/dashboard/Insights.jsx'));
const DashboardWallet = lazy(() => import('./pages/dashboard/Wallet.jsx'));
const DashboardSettings = lazy(() => import('./pages/dashboard/Settings.jsx'));

function RouteFallback() {
  return <div className="wrap" style={{ padding: '80px 20px' }}><p style={{ color: 'var(--muted)' }}>Loading...</p></div>;
}

export default function App() {
  return (
    <>
      <SplashScreen />
      <Nav />
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Marketplace />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/creators" element={<Creators />} />
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
            <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
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
              <Route path="reels" element={<DashboardReels />} />
              <Route path="insights" element={<DashboardInsights />} />
              <Route path="wallet" element={<DashboardWallet />} />
              <Route path="settings" element={<DashboardSettings />} />
            </Route>
            <Route path="/:handle/:slug/checkout" element={<Checkout />} />
            <Route path="/:handle/:slug" element={<Product />} />
            <Route path="/:handle" element={<CreatorProfile />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <Footer />
    </>
  );
}
