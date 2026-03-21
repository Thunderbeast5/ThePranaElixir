import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, 
  CreditCard, 
  MapPin, 
  Tag, 
  Check, 
  X, 
  ChevronRight, 
  Truck, 
  Lock 
} from 'lucide-react';
import Navbar from '../Pages/Navbar';
import { useAuth } from '../../context/useAuth';
import { useCart } from '../../context/useCart';
import { usePromo } from '../../context/usePromo';
import {
  collection,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../../firebase';

void motion;

const Checkout = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { items: cartItems, subtotal: cartSubtotal, clearCart, shipping } = useCart();
  const { promoCoupon } = usePromo();
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [_showCouponInput, setShowCouponInput] = useState(false);

  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');

  const [shippingForm, setShippingForm] = useState({
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    postalCode: '',
    phone: '',
    state: '',
  });

  const [placing, setPlacing] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const validCoupons = {
    ...(promoCoupon?.code
      ? {
          [promoCoupon.code]: {
            discount: promoCoupon.discount,
            type: promoCoupon.type,
          },
        }
      : {}),
    'HAPPY': { discount: 10, type: 'percentage' },
    'SAVE20': { discount: 20, type: 'percentage' },
    'FLAT100': { discount: 100, type: 'fixed' },
  };

  // const shipping = 0; // Removed local constant
  
  let discount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.type === 'percentage') {
      discount = (cartSubtotal * appliedCoupon.discount) / 100;
    } else if (appliedCoupon.type === 'fixed') {
      discount = appliedCoupon.discount;
    }
  }

  const finalTotal = cartSubtotal - discount + shipping;

  useEffect(() => {
    if (!loading && !user) {
      navigate('/customer/login');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const loadAddresses = async () => {
      if (!user) return;
      const snap = await getDocs(
        query(collection(db, 'users', user.uid, 'addresses'), orderBy('createdAt', 'desc')),
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAddresses(list);
      if (list.length > 0) {
        setSelectedAddressId(list[0].id);
      }
    };
    loadAddresses();
  }, [user]);

  useEffect(() => {
    const selected = addresses.find((a) => a.id === selectedAddressId);
    if (!selected) return;

    setShippingForm((prev) => ({
      ...prev,
      address: String(selected.addressLine || selected.text || '').trim() || prev.address,
      city: String(selected.city || '').trim() || prev.city,
      postalCode: String(selected.postalCode || '').trim() || prev.postalCode,
      firstName: String(selected.firstName || '').trim() || prev.firstName,
      lastName: String(selected.lastName || '').trim() || prev.lastName,
      phone: String(selected.phone || selected.mobile || selected.phoneNumber || '').trim() || prev.phone,
      state: String(selected.state || selected.province || '').trim() || prev.state,
    }));
  }, [addresses, selectedAddressId]);

  const estimatedDelivery = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 4);
    return d.toLocaleDateString();
  }, []);

  const handleApplyCoupon = () => {
    const code = couponCode.trim().toUpperCase();
    if (validCoupons[code]) {
      setAppliedCoupon({ code, ...validCoupons[code] });
      setCouponError('');
      setCouponCode('');
      setShowCouponInput(false);
    } else {
      setCouponError('Invalid coupon code');
      setAppliedCoupon(null);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  };

  const loadRazorpayScript = () => {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if (window.Razorpay) return Promise.resolve(true);

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const createShiprocketShipment = async ({ firestoreOrderId }) => {
    const baseUrl = String(import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');
    if (!baseUrl) throw new Error('Missing VITE_BACKEND_URL');
    if (!user) throw new Error('Not logged in');

    const token = await user.getIdToken();
    const selected = addresses.find((a) => a.id === selectedAddressId);

    const overrides = {
      phone: shippingForm.phone || selected?.phone || selected?.mobile || selected?.phoneNumber || '',
      state: shippingForm.state || selected?.state || selected?.province || '',
      country: selected?.country || 'India',
    };

    const res = await fetch(`${baseUrl}/shiprocket/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ firestoreOrderId, overrides }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        typeof json?.message === 'string'
          ? json.message
          : json?.message
            ? JSON.stringify(json.message)
            : 'Shiprocket shipment failed'
      const details = json?.details ? ` | details: ${JSON.stringify(json.details)}` : ''
      throw new Error(`${msg}${details}`)
    }
    return json;
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (!user || cartItems.length === 0) return;
    setPaymentError('');
    setPlacing(true);

    try {
      const payloadItems = cartItems.map((it) => ({
        productId: String(it.productId || it.id),
        title: it.title || '',
        price: Number(it.price || 0),
        quantity: Number(it.quantity || 0),
        image: it.image || '',
      }));

      const shippingAddress = {
        firstName: shippingForm.firstName.trim(),
        lastName: shippingForm.lastName.trim(),
        address: shippingForm.address.trim(),
        city: shippingForm.city.trim(),
        postalCode: shippingForm.postalCode.trim(),
        phone: shippingForm.phone.trim(),
        state: shippingForm.state.trim(),
        savedAddressId: selectedAddressId || null,
      };

      const ok = await loadRazorpayScript();
      if (!ok) {
        setPaymentError('Failed to load Razorpay.');
        setPlacing(false);
        return;
      }

      const baseUrl = String(import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');
      if (!baseUrl) throw new Error('Missing VITE_BACKEND_URL');

      const token = await user.getIdToken();
      const createRes = await fetch(`${baseUrl}/razorpay/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          total: Number(finalTotal || 0),
          subtotal: Number(cartSubtotal || 0),
          discount: Number(discount || 0),
          shipping: Number(shipping || 0),
          items: payloadItems,
          shippingAddress,
          customerEmail: user.email || '',
        }),
      });

      const createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        throw new Error(createJson?.message || 'Failed to create Razorpay order');
      }

      const { firestoreOrderId, razorpayOrderId, amount, currency, keyId } = createJson || {};

      if (!firestoreOrderId || !razorpayOrderId || !keyId) {
        setPaymentError('Initialization failed.');
        setPlacing(false);
        return;
      }

      const options = {
        key: keyId,
        amount,
        currency: currency || 'INR',
        name: 'The Prana Elixir',
        description: 'Order Payment',
        order_id: razorpayOrderId,
        prefill: {
          name: `${shippingAddress.firstName} ${shippingAddress.lastName}`.trim(),
          email: user.email || '',
        },
        notes: { firestoreOrderId },
        handler: async (response) => {
          try {
            const verifyRes = await fetch(`${baseUrl}/razorpay/verify-payment`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                firestoreOrderId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyJson = await verifyRes.json().catch(() => ({}));
            if (!verifyRes.ok) {
              throw new Error(verifyJson?.message || 'Verification failed.');
            }

            try { await createShiprocketShipment({ firestoreOrderId }); } catch (err) { console.error(err); }

            await clearCart();
            navigate('/order-success', { state: { orderId: firestoreOrderId, estimatedDelivery } });
          } catch (err) {
            setPaymentError(err?.message || 'Verification failed.');
          } finally {
            setPlacing(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaymentError('Payment cancelled.');
            setPlacing(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        setPaymentError(resp?.error?.description || 'Payment failed.');
        setPlacing(false);
      });
      rzp.open();
    } catch {
        setPaymentError('An error occurred. Please try again.');
        setPlacing(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-main selection:bg-primary-button/10">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-6 py-16">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
            <h1 className="text-4xl md:text-5xl font-serif text-text-primary tracking-tight">Checkout</h1>
            <p className="text-text-secondary mt-3 tracking-[0.2em] text-[10px] uppercase font-bold">Secure Artisanal Luxury</p>
        </motion.div>

        <form onSubmit={handlePlaceOrder} className="flex flex-col lg:flex-row gap-16">
          
          {/* LEFT: Shipping & Payment */}
          <div className="flex-1 space-y-12">
            
            <motion.div 
              initial={{ opacity: 0, x: -20 }} 
              animate={{ opacity: 1, x: 0 }} 
              className="bg-white p-10 rounded-[2.5rem] border border-border/40 shadow-sm"
            >
              <div className="flex items-center gap-4 mb-10">
                <div className="w-12 h-12 rounded-2xl bg-bg-surface flex items-center justify-center text-primary-button">
                  <MapPin size={22} />
                </div>
                <h2 className="text-2xl font-serif text-text-primary">Delivery Address</h2>
              </div>
              
              {addresses.length > 0 && (
                <div className="mb-10 p-4 bg-bg-surface/50 rounded-2xl border border-border/20">
                  <label className="text-[10px] font-bold uppercase text-text-secondary tracking-widest mb-2 block ml-2">Select Saved Address</label>
                  <select
                    value={selectedAddressId}
                    onChange={(e) => setSelectedAddressId(e.target.value)}
                    className="w-full bg-transparent text-text-primary font-medium focus:outline-none cursor-pointer p-2"
                  >
                    {addresses.map((a) => (<option key={a.id} value={a.id}>{a.type || 'Address'} — {a.city}</option>))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
                {Object.keys(shippingForm).map((field) => (
                  <div key={field} className={`space-y-1 border-b border-border/40 pb-2 ${field === 'address' ? 'md:col-span-2' : ''}`}>
                    <label className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">
                        {field.replace(/([A-Z])/g, ' $1')}
                    </label>
                    <input
                      required
                      value={shippingForm[field]}
                      onChange={(e) => setShippingForm(p => ({ ...p, [field]: e.target.value }))}
                      className="w-full bg-transparent outline-none text-text-primary py-1 placeholder:text-border/40"
                      placeholder={`Enter ${field}`}
                    />
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: -20 }} 
              animate={{ opacity: 1, x: 0 }} 
              transition={{ delay: 0.2 }}
              className="bg-white p-10 rounded-[2.5rem] border border-border/40 shadow-sm"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-bg-surface flex items-center justify-center text-primary-button">
                  <CreditCard size={22} />
                </div>
                <h2 className="text-2xl font-serif text-text-primary">Payment Method</h2>
              </div>

              <div className="p-6 bg-primary-button/5 rounded-2xl border border-primary-button/10 flex gap-4 items-start mb-6">
                <ShieldCheck className="text-primary-button mt-0.5" size={20} />
                <p className="text-sm text-text-primary/80 leading-relaxed font-light italic">
                  Instant secure payment via Razorpay. We support all major UPI apps, Cards, and NetBanking.
                </p>
              </div>

              {paymentError && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 bg-red-50 text-red-500 text-xs font-bold uppercase tracking-widest rounded-xl mb-4">
                  {paymentError}
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* RIGHT: Order Summary */}
          <div className="lg:w-[420px]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              className="bg-bg-surface p-10 rounded-[3rem] border border-border/40 sticky top-32 shadow-2xl"
            >
              <h3 className="text-2xl font-serif text-text-primary mb-10 tracking-tight">Summary</h3>
              
              <div className="space-y-6 mb-10 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex gap-4 items-center group">
                    <div className="w-16 h-20 bg-white rounded-2xl overflow-hidden border border-border/20 shadow-sm flex-shrink-0">
                      <img src={item.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.title} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <h4 className="text-[11px] font-bold text-text-primary uppercase tracking-widest leading-tight">{item.title}</h4>
                      <p className="text-[10px] text-text-secondary uppercase tracking-tighter italic">Qty: {item.quantity}</p>
                    </div>
                    <span className="text-sm font-bold text-text-primary">₹{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {/* Coupon Section */}
              <div className="mb-10 pt-6 border-t border-border/20">
                <AnimatePresence mode="wait">
                  {!appliedCoupon ? (
                    <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <div className="flex gap-2">
                        <input
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          className="flex-1 bg-white border border-border/40 rounded-full px-5 py-2.5 text-[10px] uppercase tracking-widest outline-none focus:border-primary-button"
                          placeholder="PROMO CODE"
                        />
                        <button type="button" onClick={handleApplyCoupon} className="px-6 py-2.5 bg-text-primary text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-primary-button transition-colors">Apply</button>
                      </div>
                      {couponError && <p className="text-[9px] text-red-500 mt-2 ml-4 font-bold uppercase tracking-widest">{couponError}</p>}
                    </motion.div>
                  ) : (
                    <motion.div key="applied" initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="flex justify-between items-center bg-green-50 p-4 rounded-2xl border border-green-100">
                      <div className="flex items-center gap-2">
                        <Check size={14} className="text-green-600" />
                        <span className="text-[10px] font-bold text-green-700 tracking-widest uppercase">{appliedCoupon.code}</span>
                      </div>
                      <button type="button" onClick={handleRemoveCoupon} className="text-text-secondary hover:text-red-500 transition-colors"><X size={16} /></button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-4 text-text-secondary text-[11px] font-bold uppercase tracking-[0.2em] mb-10">
                <div className="flex justify-between"><span>Subtotal</span><span>₹{cartSubtotal.toFixed(2)}</span></div>
                {discount > 0 && <div className="flex justify-between text-green-600"><span>Incentive</span><span>- ₹{discount.toFixed(2)}</span></div>}
                <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2"><Truck size={14} className="opacity-60" /> Delivery</span>
                    <span className={shipping === 0 ? "text-green-600 font-bold" : "text-text-primary font-bold"}>
                        {shipping === 0 ? 'Complimentary' : `₹${shipping.toFixed(2)}`}
                    </span>
                </div>
                <div className="flex justify-between text-2xl  text-text-primary pt-6 border-t border-border/20 mt-4 normal-case tracking-tight">
                  <span>Total</span><span>₹{finalTotal.toFixed(2)}</span>
                </div>
              </div>

              <motion.button 
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                type="submit" 
                disabled={placing}
                className="w-full bg-text-primary text-white py-5 rounded-full flex items-center justify-center gap-4 shadow-xl hover:bg-primary-button transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {placing ? (
                   <span className="text-xs font-bold uppercase tracking-[0.3em] animate-pulse">Initializing...</span>
                ) : (
                  <>
                    <Lock size={16} className="opacity-60 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-[0.3em]">Pay ₹{finalTotal.toFixed(0)}</span>
                  </>
                )}
              </motion.button>
              
              <div className="flex items-center justify-center gap-2 mt-6 text-[9px] uppercase tracking-[0.2em] text-text-secondary opacity-60">
                <ShieldCheck size={12} />
                <span>Encrypted & Secure SSL Checkout</span>
              </div>
            </motion.div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Checkout;