import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import SEO from './Components/Elements/SEO'
import Navbar from "./Components/Pages/Navbar"
import HeroCarousel from "./Components/Pages/HeroCarousel"
import ProductsSection from "./Components/Pages/Products"
import FeaturedCollections from "./Components/Pages/FeaturedCollections"
import AboutUs from "./Components/Pages/AboutUs"
import BestSellers from "./Components/Pages/BestSellers"
import Testimonials from "./Components/Pages/Testimonials"
import Features from "./Components/Pages/Features"
import Footer from "./Components/Pages/Footer"
import BackToTop from "./Components/Elements/BackToTop"
import Contact from "./Components/Pages/Connect"
import Story from "./Components/Pages/Story"
import Custom from "./Components/Pages/Custom"
import PrivacyPolicy from "./Components/Policies/PrivacyPolicy"
import RefundPolicy from "./Components/Policies/RefundPolicy" 
import TermsAndConditions from "./Components/Policies/TermsAndConditions"
import ShippingPolicy from "./Components/Policies/ShippingPolicy"

// Admin Pages
import AdminLogin from "./Components/Admin Dashboard/AdminLogin"
import AdminDashboard from "./Components/Admin Dashboard/AdminDashboard"
// Product Pages
import Shop from './Components/Products/Shop'
import ProductDetail from './Components/Products/ProductDetail'
//Customer Pages
import CustomerLogin from './Components/Customer/CustomerLogin'
import CustomerProfile from './Components/Customer/CustomerProfile'
//Order Routes
import Checkout from './Components/Orders/Checkout'
import OrderSuccess from './Components/Orders/OrderSuccess'
import OrderTracking from './Components/Orders/OrderTracking'

import { useAuth } from './context/useAuth'
import { db } from './firebase'
import { doc, getDoc } from 'firebase/firestore'

function ScrollToTop() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

  return null
}

function AdminGuard({ children }) {
  const { user, loading } = useAuth()
  const [checking, setChecking] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const run = async () => {
      if (loading) return
      if (!user) {
        setIsAdmin(false)
        setChecking(false)
        return
      }
      try {
        const snap = await getDoc(doc(db, 'admins', user.uid))
        setIsAdmin(snap.exists())
      } finally {
        setChecking(false)
      }
    }

    setChecking(true)
    run()
  }, [user, loading])

  if (loading || checking) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center text-text-primary">
        Loading…
      </div>
    )
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" replace />
  }

  return children
}

function App() {
  return (
    <div className='relative'>
    <Router>
      <ScrollToTop />
      <Routes>
        {/* Main website route */}
        <Route path="/" element={
          <div className="relative">
            <SEO 
              title="The Prana Elixir – Holistic Wellness & Natural Skincare" 
              description="Welcome to The Prana Elixir. Handcrafted cold process soaps and pure Ayurvedic skincare for your wellness." 
            />
            {/* Request indexing for homepage only */}
            <Helmet>
              <meta name="robots" content="index, follow" />
            </Helmet>
            <Navbar />
            <HeroCarousel />
            <Features />
            <AboutUs />
            <BestSellers />
            <FeaturedCollections />
            {/* <ProductsSection /> */}
            <Testimonials />
            <Footer />
            <BackToTop />
          </div>
        } />
        
        {/* Admin routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <AdminGuard>
              <AdminDashboard />
            </AdminGuard>
          }
        />
        
        {/* Product routes */}
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:id" element={<ProductDetail />} />
        
        {/* Customer routes */}
        <Route path="/customer/login" element={<CustomerLogin />} />
        <Route path="/customer/profile" element={<CustomerProfile />} />
        
        {/* Order routes */}
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order-success" element={<OrderSuccess />} />
        <Route path="/orders/:orderId" element={<OrderTracking />} />
        {/* Contact route */}
        <Route path="/contact" element={<Contact />} />
        {/* Story route */}
        <Route path="/story" element={<Story />} />
        {/* Custom route */}
        <Route path="/custom" element={<Custom />} />
        {/* Policy routes */}
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/refund-policy" element={<RefundPolicy />} />
        <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
        <Route path="/shipping-policy" element={<ShippingPolicy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
    </div>
  )
}

export default App


