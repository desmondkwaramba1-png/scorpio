import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext.jsx';
import { api } from '../lib/api';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refreshCount = useCallback(async () => {
    if (!user) { setCount(0); return; }
    try {
      const data = await api.get('/api/cart/count');
      setCount(data.cart_count);
    } catch {
      // not logged in / transient error — badge just stays at its last value
    }
  }, [user]);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  async function addToCart(productSlug) {
    const data = await api.post('/api/cart', { product_slug: productSlug });
    setCount(data.cart_count);
    return data;
  }

  async function removeFromCart(productId) {
    const data = await api.delete(`/api/cart/${productId}`);
    setCount(data.cart_count);
    return data;
  }

  return (
    <CartContext.Provider value={{ count, refreshCount, addToCart, removeFromCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
