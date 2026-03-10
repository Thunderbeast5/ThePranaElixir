import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './style.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { CartProvider } from './context/CartContext.jsx'
import { PromoProvider } from './context/PromoContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'

createRoot(document.getElementById('root')).render(
  <HelmetProvider>
    <ToastProvider>
      <AuthProvider>
        <CartProvider>
          <PromoProvider>
            <App />
          </PromoProvider>
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  </HelmetProvider>,
)
