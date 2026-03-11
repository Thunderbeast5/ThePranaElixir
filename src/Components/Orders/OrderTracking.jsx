import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink, Package } from 'lucide-react';
import Navbar from '../Pages/Navbar';
import { useAuth } from '../../context/useAuth';
import { db } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';

void motion;

const STATUS_STEPS = ['Pending', 'Processing', 'Shipped', 'Delivered'];

function normalizeStatus(status) {
  const s = String(status || '').trim();
  const match = STATUS_STEPS.find((x) => x.toLowerCase() === s.toLowerCase());
  return match || (s ? s : 'Processing');
}

function statusIndex(status) {
  const s = normalizeStatus(status);
  const idx = STATUS_STEPS.indexOf(s);
  return idx === -1 ? 1 : idx;
}

const OrderTracking = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { user, loading } = useAuth();

  const [order, setOrder] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(true);

  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [trackingData, setTrackingData] = useState(null);

  const currentStatus = useMemo(() => normalizeStatus(order?.status), [order?.status]);
  const currentIdx = useMemo(() => statusIndex(order?.status), [order?.status]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/customer/login');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const run = async () => {
      if (!orderId) return;
      setLoadingOrder(true);
      try {
        const snap = await getDoc(doc(db, 'orders', String(orderId)));
        if (!snap.exists()) {
          setOrder(null);
          return;
        }
        setOrder({ id: snap.id, ...snap.data() });
      } finally {
        setLoadingOrder(false);
      }
    };

    run();
  }, [orderId]);

  const handleFetchTracking = async () => {
    setTrackingError('');
    setTrackingData(null);

    const baseUrl = String(import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');
    if (!baseUrl) {
      setTrackingError('Tracking is not configured. Missing VITE_BACKEND_URL.');
      return;
    }

    const awb = order?.shiprocket?.awbCode;
    if (!awb) {
      setTrackingError('Tracking not available for this order yet.');
      return;
    }

    if (!user) {
      setTrackingError('Please login again.');
      return;
    }

    setTrackingLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${baseUrl}/shiprocket/track/${encodeURIComponent(String(awb))}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json?.message === 'string' ? json.message : 'Failed to fetch tracking details.';
        throw new Error(msg);
      }
      setTrackingData(json);
    } catch (e) {
      setTrackingError(e?.message || 'Failed to fetch tracking details.');
    } finally {
      setTrackingLoading(false);
    }
  };

  const orderNumber = String(order?.orderNumber || '').trim() || `ORD-${String(orderId || '').slice(0, 8).toUpperCase()}`;
  const total = Number(order?.total || 0);
  const items = Array.isArray(order?.items) ? order.items : [];

  return (
    <div className="min-h-screen bg-bg-main selection:bg-primary-button/10">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="flex items-center gap-4 mb-10">
          <button
            onClick={() => navigate('/customer/profile')}
            className="p-3 rounded-full bg-white border border-border/40 text-text-primary hover:bg-bg-surface transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-3xl md:text-4xl font-serif text-text-primary">Track Order</h1>
            <p className="text-text-secondary mt-2 tracking-[0.2em] text-[10px] uppercase font-bold">{orderNumber}</p>
          </div>
        </div>

        {loadingOrder ? (
          <div className="bg-white p-10 rounded-[2.5rem] border border-border/40 text-center text-text-secondary italic">
            Loading tracking...
          </div>
        ) : !order ? (
          <div className="bg-white p-10 rounded-[2.5rem] border border-border/40 text-center text-text-secondary italic">
            Order not found.
          </div>
        ) : (
          <>
            <div className="bg-white p-10 rounded-[2.5rem] border border-border/40 shadow-sm mb-10">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
                <div>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">Current Status</div>
                  <div className="mt-3 flex items-center gap-3">
                    <span
                      className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all
                        ${currentStatus === 'Delivered' ? 'bg-green-50 text-green-600' :
                        currentStatus === 'Shipped' ? 'bg-blue-50 text-blue-600' :
                        currentStatus === 'Processing' ? 'bg-yellow-50 text-yellow-600' :
                        'bg-orange-50 text-orange-600'
                      }`}
                    >
                      {currentStatus}
                    </span>
                    <span className="text-sm font-bold text-text-primary">₹{total.toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  {order?.shiprocket?.awbCode ? (
                    <button
                      onClick={handleFetchTracking}
                      disabled={trackingLoading}
                      className="px-6 py-3 rounded-full bg-text-primary text-white text-[10px] font-bold uppercase tracking-widest hover:bg-primary-button transition-colors disabled:opacity-50"
                    >
                      {trackingLoading ? 'Fetching...' : `Track Shipment (${String(order.shiprocket.awbCode)})`}
                    </button>
                  ) : (
                    <div className="px-6 py-3 rounded-full bg-bg-surface border border-border/40 text-[10px] font-bold uppercase tracking-widest text-text-secondary">
                      Shipment not created yet
                    </div>
                  )}

                  {order?.shiprocket?.raw?.tracking_url ? (
                    <a
                      href={String(order.shiprocket.raw.tracking_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="px-6 py-3 rounded-full bg-white border border-border/40 text-text-primary text-[10px] font-bold uppercase tracking-widest hover:bg-bg-surface transition-colors inline-flex items-center gap-2"
                    >
                      Open Link
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                </div>
              </div>

              {trackingError ? (
                <div className="mt-6 p-4 bg-red-50 text-red-500 text-xs font-bold uppercase tracking-widest rounded-xl">
                  {trackingError}
                </div>
              ) : null}

              {trackingData ? (
                <div className="mt-8 bg-bg-surface/40 p-6 rounded-2xl border border-border/30">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-4">Latest Tracking</div>
                  <div className="text-sm text-text-primary wrap-break-word">
                    {typeof trackingData === 'string' ? trackingData : JSON.stringify(trackingData)}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="bg-white p-10 rounded-[2.5rem] border border-border/40 shadow-sm mb-10">
              <div className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-8">Progress</div>

              <div className="space-y-4">
                {STATUS_STEPS.map((step, idx) => {
                  const done = idx <= currentIdx;
                  return (
                    <div key={step} className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center border text-xs font-bold
                          ${done ? 'bg-text-primary text-white border-text-primary' : 'bg-white text-text-secondary border-border/60'}
                        `}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-text-primary">{step}</div>
                        <div className="text-[10px] uppercase tracking-widest text-text-secondary mt-1">
                          {done ? 'Completed' : 'Pending'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white p-10 rounded-[2.5rem] border border-border/40 shadow-sm">
              <div className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mb-8">Items</div>

              {items.length === 0 ? (
                <div className="text-text-secondary italic text-center py-8">No items found.</div>
              ) : (
                <div className="space-y-4">
                  {items.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-4 bg-bg-surface/30 rounded-2xl border border-border/20">
                      <div className="w-12 h-12 rounded-xl bg-bg-main border border-border/20 overflow-hidden shrink-0 flex items-center justify-center">
                        {it?.image ? (
                          <img src={it.image} className="w-full h-full object-cover" />
                        ) : (
                          <Package size={18} className="text-border" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-text-primary">{String(it?.title || it?.name || 'Item')}</div>
                        <div className="text-[10px] uppercase tracking-widest text-text-secondary mt-1">Qty: {Number(it?.quantity || 1)}</div>
                      </div>
                      <div className="text-sm font-bold text-text-primary">₹{(Number(it?.price || 0) * Number(it?.quantity || 1)).toLocaleString('en-IN')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderTracking;
