import { Routes, Route } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import SplashScreen from './components/SplashScreen.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Marketplace from './pages/Marketplace.jsx';
import Discover from './pages/Discover.jsx';
import Creators from './pages/Creators.jsx';
import Login from './pages/Login.jsx';
import OAuthComplete from './pages/OAuthComplete.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import Terms from './pages/Terms.jsx';
import AcceptTerms from './pages/AcceptTerms.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Account from './pages/Account.jsx';
import Product from './pages/Product.jsx';
import Checkout from './pages/Checkout.jsx';
import Cart from './pages/Cart.jsx';
import CartCheckout from './pages/CartCheckout.jsx';
import PaymentReturn from './pages/PaymentReturn.jsx';
import CreatorProfile from './pages/CreatorProfile.jsx';
import DashboardLayout from './pages/dashboard/DashboardLayout.jsx';
import DashboardHome from './pages/dashboard/DashboardHome.jsx';
import DashboardProducts from './pages/dashboard/Products.jsx';
import DashboardOrders from './pages/dashboard/Orders.jsx';
import DashboardNewProduct from './pages/dashboard/NewProduct.jsx';
import DashboardEditProduct from './pages/dashboard/EditProduct.jsx';
import DashboardReels from './pages/dashboard/Reels.jsx';
import DashboardInsights from './pages/dashboard/Insights.jsx';
import DashboardWallet from './pages/dashboard/Wallet.jsx';
import DashboardSettings from './pages/dashboard/Settings.jsx';

export default function App() {
  return (
    <>
      <SplashScreen />
      <Nav />
      <Routes>
        <Route path="/" element={<Marketplace />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/creators" element={<Creators />} />
        <Route path="/login" element={<Login />} />
        <Route path="/oauth-complete" element={<OAuthComplete />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/terms" element={<Terms />} />
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
    </>
  );
}
