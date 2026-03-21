import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Image as ImageIcon, 
  MessageSquareQuote, 
  Tag, 
  Star, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  ChevronRight, 
  Search,
  LogOut,
  UploadCloud,
  Filter,
  ArrowUpDown
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { useToast } from '../../context/useToast';
import {
  addDoc, collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc,
} from 'firebase/firestore';

void motion;

// --- SUB-COMPONENTS ---

// 1. PRODUCTS MANAGER
const ProductsManager = () => {
  const { addToast } = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState('');

  React.useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'products', id));
      addToast('Product deleted', 'success');
    } catch (e) {
      addToast('Failed to delete product', 'error');
      throw e;
    }
  };
  
  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');
    const payload = {
      name: currentProduct.name || '', price: Number(currentProduct.price || 0),
      stock: Number(currentProduct.stock || 0), category: currentProduct.category || '',
      imageUrl: currentProduct.imageUrl || '', description: currentProduct.description || '',
      isBestSeller: Boolean(currentProduct.isBestSeller), updatedAt: serverTimestamp(),
    };
    
    if (payload.isBestSeller && !products.find(p => p.id === currentProduct.id)?.isBestSeller && products.filter(p => p.isBestSeller).length >= 3) {
      setSaveError('Max 3 best sellers allowed.'); return;
    }

    try {
      if (currentProduct.id) {
        await setDoc(doc(db, 'products', currentProduct.id), payload, { merge: true });
        addToast('Product updated', 'success');
      } else {
        await addDoc(collection(db, 'products'), { ...payload, createdAt: serverTimestamp() });
        addToast('Product added', 'success');
      }

      setIsEditing(false); setCurrentProduct(null);
    } catch (e) {
      addToast('Failed to save product', 'error');
      throw e;
    }
  };

  const uploadToCloudinary = async (file) => {
    if (!file) return;
    setUploadError(''); setUploadingImage(true);
    try {
      const formData = new FormData(); formData.append('file', file);
      formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message);
      setCurrentProduct(prev => ({ ...prev, imageUrl: data.secure_url || data.url }));
    } catch (e) { setUploadError(e.message); } finally { setUploadingImage(false); }
  };

  const openEdit = (prod = { name: '', price: '', stock: '', category: '', imageUrl: '', description: '', isBestSeller: false }) => {
    setSaveError(''); setUploadError(''); setCurrentProduct(prod); setIsEditing(true);
  };

  const CATEGORIES = [
    'Core Variant', 
    'Signature Variant', 
    'Combo', 
    'Gift Box', 
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex justify-between items-center bg-white/50 p-6 rounded-[2rem] border border-border/40 backdrop-blur-sm">
        <div>
           <h2 className="text-3xl font-serif text-text-primary">Inventory</h2>
           <p className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mt-1">Manage Catalog</p>
        </div>
        <button onClick={() => openEdit()} className="bg-text-primary text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-button transition-all flex items-center gap-2 shadow-lg">
          <Plus size={16} /> Add Product
        </button>
      </div>

      <AnimatePresence>
      {isEditing && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="bg-white p-10 rounded-[2.5rem] border border-border/40 shadow-xl relative overflow-hidden">
          <h3 className="text-xl font-serif text-text-primary mb-8 border-b border-border/20 pb-4">{currentProduct.id ? 'Edit Item' : 'New Creation'}</h3>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Name Input */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Name</label>
              <input 
                className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors" 
                value={currentProduct.name} 
                onChange={e => setCurrentProduct({...currentProduct, name: e.target.value})} 
              />
            </div>

            {/* Category Dropdown */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Category</label>
              <select 
                className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors cursor-pointer"
                value={currentProduct.category} 
                onChange={e => setCurrentProduct({...currentProduct, category: e.target.value})}
              >
                <option value="">Select Category</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            {['price', 'stock'].map(field => (
              <div key={field} className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">{field}</label>
                <input type="number" className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors" value={currentProduct[field]} onChange={e => setCurrentProduct({...currentProduct, [field]: e.target.value})} />
              </div>
            ))}
            
            <div className="md:col-span-2 space-y-4 p-6 bg-bg-surface/50 rounded-2xl border border-border/20 border-dashed">
               <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-white rounded-xl border border-border/40 flex items-center justify-center overflow-hidden">
                    {currentProduct.imageUrl ? <img src={currentProduct.imageUrl} className="w-full h-full object-cover" /> : <ImageIcon className="text-text-secondary opacity-30" />}
                  </div>
                  <div className="flex-1 space-y-2">
                     <label className="bg-white border border-border/40 text-text-primary px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest cursor-pointer hover:bg-bg-main flex items-center gap-2 w-fit">
                        <UploadCloud size={14} /> {uploadingImage ? 'Uploading...' : 'Upload Image'}
                        <input type="file" hidden accept="image/*" onChange={e => uploadToCloudinary(e.target.files?.[0])} disabled={uploadingImage} />
                     </label>
                     <input placeholder="Or paste URL..." className="w-full bg-transparent text-xs text-text-secondary outline-none border-b border-border/40 pb-1" value={currentProduct.imageUrl} onChange={e => setCurrentProduct({...currentProduct, imageUrl: e.target.value})} />
                  </div>
               </div>
               {uploadError && <p className="text-red-500 text-xs">{uploadError}</p>}
            </div>

            <div className="md:col-span-2 space-y-2">
               <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Description</label>
               <textarea rows="3" className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors resize-none" value={currentProduct.description} onChange={e => setCurrentProduct({...currentProduct, description: e.target.value})} />
            </div>

            <label className="md:col-span-2 flex items-center gap-3 p-4 bg-yellow-50/50 border border-yellow-100 rounded-xl cursor-pointer">
              <input type="checkbox" checked={Boolean(currentProduct.isBestSeller)} onChange={e => setCurrentProduct({ ...currentProduct, isBestSeller: e.target.checked })} className="accent-primary-button w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-widest text-text-primary">Featured Best Seller</span>
            </label>

            {saveError && <div className="md:col-span-2 text-red-500 text-xs font-bold uppercase tracking-widest bg-red-50 p-3 rounded-lg">{saveError}</div>}
            
            <div className="md:col-span-2 flex justify-end gap-4 border-t border-border/10 pt-6">
              <button type="button" onClick={() => setIsEditing(false)} className="px-6 py-3 text-text-secondary text-xs font-bold uppercase tracking-widest hover:text-text-primary">Cancel</button>
              <button type="submit" className="bg-primary-button text-white px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-hover shadow-lg">Save Changes</button>
            </div>
          </form>
        </motion.div>
      )}
      </AnimatePresence>

      <div className="bg-white rounded-[2rem] border border-border/40 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-bg-surface border-b border-border/40">
            <tr>
              {['Product', 'Category', 'Price', 'Stock', 'Featured', 'Actions'].map(h => (
                <th key={h} className="p-6 text-[10px] font-bold text-text-secondary uppercase tracking-widest">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {loading ? <tr><td colSpan={6} className="p-8 text-center italic text-text-secondary">Loading inventory...</td></tr> : 
             products.length === 0 ? <tr><td colSpan={6} className="p-8 text-center italic text-text-secondary">Your collection is empty.</td></tr> :
             products.map(p => (
              <tr key={p.id} className="hover:bg-bg-surface/30 transition-colors group">
                <td className="p-6 font-serif text-text-primary font-medium text-lg">{p.name}</td>
                <td className="p-6 text-xs uppercase tracking-wide text-text-secondary">{p.category}</td>
                <td className="p-6 text-text-primary font-bold">₹{p.price}</td>
                <td className="p-6"><span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${p.stock < 5 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{p.stock} Units</span></td>
                <td className="p-6">{p.isBestSeller && <Star size={14} className="fill-yellow-400 text-yellow-400" />}</td>
                <td className="p-6 flex gap-4 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(p)} className="text-text-primary hover:text-primary-button"><Edit2 size={16} /></button>
                  <button onClick={() => handleDelete(p.id)} className="text-text-secondary hover:text-red-500"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

// 2. PROMO MANAGER
const PromoManager = () => {
  const { addToast } = useToast();
  const [form, setForm] = useState({ enabled: true, text: "", code: "", discountType: "percentage", discountValue: 10 });
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'promo'), (snap) => {
      const d = snap.data() || {};
      setForm({ enabled: d.enabled !== false, text: d.text || "", code: d.code || "", discountType: d.discountType || 'percentage', discountValue: d.discountValue || 0 });
      setLoading(false);
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'promo'), { ...form, code: form.code.trim().toUpperCase(), updatedAt: serverTimestamp() }, { merge: true });
      addToast('Promo updated', 'success');
    } catch (e) {
      addToast('Failed to update promo', 'error');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl space-y-8">
      <div className="bg-white/50 p-6 rounded-[2rem] border border-border/40 backdrop-blur-sm">
         <h2 className="text-3xl font-serif text-text-primary">Announcements</h2>
         <p className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mt-1">Configure Promo Bar</p>
      </div>

      <div className="bg-white p-10 rounded-[2.5rem] border border-border/40 shadow-xl">
        {loading ? <div className="text-center py-10 italic text-text-secondary">Loading settings...</div> : (
          <form onSubmit={handleSave} className="space-y-8">
            <div className="flex items-center justify-between bg-bg-surface/50 p-4 rounded-2xl border border-border/20">
              <div><div className="font-serif text-lg text-text-primary">Promo Status</div><div className="text-xs text-text-secondary">Toggle site-wide visibility</div></div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={!!form.enabled} onChange={e => setForm({...form, enabled: e.target.checked})} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-button"></div>
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Banner Text</label>
              <input value={form.text} onChange={e => setForm({...form, text: e.target.value})} className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors" placeholder="e.g., Spring Sale is Live!" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-border/10">
              <div className="space-y-2">
                 <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Coupon Code</label>
                 <input value={form.code} onChange={e => setForm({...form, code: e.target.value})} className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none uppercase" placeholder="HAPPY" />
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Type</label>
                 <select value={form.discountType} onChange={e => setForm({...form, discountType: e.target.value})} className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none cursor-pointer"><option value="percentage">Percentage</option><option value="fixed">Fixed Amount</option></select>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Value</label>
                 <input type="number" value={form.discountValue} onChange={e => setForm({...form, discountValue: e.target.value})} className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none" />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button type="submit" disabled={saving} className="bg-text-primary text-white px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-button shadow-lg transition-all disabled:opacity-50">{saving ? 'Updating...' : 'Save Configuration'}</button>
            </div>
          </form>
        )}
      </div>
    </motion.div>
  );
};

// 3. ORDERS MANAGER
const OrdersManager = () => {
  const [orders, setOrders] = useState([]); const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('default');

  React.useEffect(() => {
    return onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(50)), snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false);
    });
  }, []);
  const updateOrder = async (id, data) => await setDoc(doc(db, 'orders', id), { ...data, updatedAt: serverTimestamp() }, { merge: true });

  const uniqueCities = useMemo(() => [...new Set(orders.map(o => o.shippingAddress?.city).filter(Boolean))].sort(), [orders]);
  const uniqueStates = useMemo(() => [...new Set(orders.map(o => o.shippingAddress?.state).filter(Boolean))].sort(), [orders]);

  const filteredOrders = useMemo(() => {
    let result = [...orders];
    if (cityFilter) result = result.filter(o => o.shippingAddress?.city === cityFilter);
    if (stateFilter) result = result.filter(o => o.shippingAddress?.state === stateFilter);
    if (sortOrder === 'price-high') result.sort((a, b) => (b.total || 0) - (a.total || 0));
    else if (sortOrder === 'price-low') result.sort((a, b) => (a.total || 0) - (b.total || 0));
    return result;
  }, [orders, cityFilter, stateFilter, sortOrder]);

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Shipped': return 'bg-green-100 text-green-700';
      case 'Delivered': return 'bg-blue-100 text-blue-700';
      case 'Cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-orange-100 text-orange-700';
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="bg-white/50 p-6 rounded-[2rem] border border-border/40 backdrop-blur-sm">
         <h2 className="text-3xl font-serif text-text-primary">Orders</h2>
         <p className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mt-1">Track & Fulfill</p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-5 rounded-[1.5rem] border border-border/40 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-text-secondary">
          <Filter size={16} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Filters</span>
        </div>
        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)} className="bg-bg-surface border border-border/40 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-text-primary outline-none cursor-pointer">
          <option value="">All Cities</option>
          {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="bg-bg-surface border border-border/40 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-text-primary outline-none cursor-pointer">
          <option value="">All States</option>
          {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <ArrowUpDown size={16} className="text-text-secondary" />
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="bg-bg-surface border border-border/40 rounded-full px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-text-primary outline-none cursor-pointer">
            <option value="default">Latest First</option>
            <option value="price-high">Price: High → Low</option>
            <option value="price-low">Price: Low → High</option>
          </select>
        </div>
        {(cityFilter || stateFilter || sortOrder !== 'default') && (
          <button onClick={() => { setCityFilter(''); setStateFilter(''); setSortOrder('default'); }} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700 transition-colors">
            Clear All
          </button>
        )}
      </div>

      <div className="grid gap-6">
        {loading ? <div className="text-center italic text-text-secondary">Fetching orders...</div> : filteredOrders.length === 0 ? <div className="text-center italic text-text-secondary">{orders.length === 0 ? 'No orders received yet.' : 'No orders match the selected filters.'}</div> : 
         filteredOrders.map(order => (
          <div key={order.id} className="bg-white border border-border/40 rounded-[2rem] p-8 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-border/10 pb-6">
              <div>
                <h3 className="font-serif text-xl text-text-primary">Order #{order.orderNumber || String(order.id).slice(0,8).toUpperCase()}</h3>
                <p className="text-xs uppercase tracking-wide text-text-secondary mt-1">{order.customerEmail}</p>
              </div>
              <div className="flex items-center gap-4 mt-4 md:mt-0">
                <span className="font-bold text-xl text-text-primary">₹{order.total}</span>
                <select value={order.status || 'Pending'} onChange={e => updateOrder(order.id, { status: e.target.value })} className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest outline-none cursor-pointer border-none ${getStatusStyle(order.status)}`}>
                  {['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="p-6 bg-bg-surface/30 rounded-2xl border border-border/20">
                <div className="text-[10px] uppercase font-bold text-text-secondary tracking-widest mb-3">Shipping To</div>
                <div className="text-sm font-serif text-text-primary">{order.shippingAddress?.firstName} {order.shippingAddress?.lastName}</div>
                <div className="text-xs text-text-secondary mt-1 leading-relaxed">{order.shippingAddress?.address}<br/>{order.shippingAddress?.city}, {order.shippingAddress?.postalCode}</div>
              </div>
              <div className="p-6 bg-bg-surface/30 rounded-2xl border border-border/20">
                <div className="text-[10px] uppercase font-bold text-text-secondary tracking-widest mb-3">Payment Details</div>
                <div className="text-xs text-text-secondary space-y-1">
                   <div className="flex justify-between"><span>Method</span><span className="font-bold text-text-primary">{order.paymentMethod || 'Razorpay'}</span></div>
                   <div className="flex justify-between"><span>Status</span><span className="font-bold text-green-600">{order.paymentStatus || 'Paid'}</span></div>
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              {order.items?.map((it, idx) => (
                <div key={idx} className="flex items-center gap-4 p-3 hover:bg-bg-surface/50 rounded-xl transition-colors">
                  <div className="w-12 h-12 rounded-lg bg-bg-main border border-border/20 overflow-hidden flex-shrink-0">
                     {it.image && <img src={it.image} className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-text-primary">{it.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-text-secondary">Qty: {it.quantity}</div>
                  </div>
                  <div className="text-sm font-bold text-text-primary">₹{it.price * it.quantity}</div>
                </div>
              ))}
            </div>
            
            <div className="flex gap-2 bg-yellow-50/50 p-2 rounded-xl border border-yellow-100/50">
               <input value={order.adminInstruction || ''} onChange={e => updateOrder(order.id, { adminInstruction: e.target.value })} placeholder="Add private note..." className="flex-1 bg-transparent px-3 text-xs text-text-primary outline-none" />
               <button className="p-2 text-yellow-600 hover:bg-yellow-100 rounded-lg"><Save size={16}/></button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

// 4. HERO MANAGER (Simplified for brevity, similar styling applied)
const HeroManager = () => {
  const { addToast } = useToast();
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(null);
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false);
  const [heroUploadError, setHeroUploadError] = useState('');

  React.useEffect(() => {
    const q = query(collection(db, 'hero_slides'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setSlides(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const uploadHeroToCloudinary = async (file) => {
    if (!file) return;
    setHeroUploadError('');
    setUploadingHeroImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Upload failed');
      setCurrentSlide((prev) => ({ ...prev, imageUrl: data.secure_url || data.url }));
    } catch (e) {
      setHeroUploadError(e.message);
    } finally {
      setUploadingHeroImage(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      title: currentSlide.title || '',
      subtitle: currentSlide.subtitle || '',
      imageUrl: currentSlide.imageUrl || '',
      updatedAt: serverTimestamp(),
    };

    try {
      if (currentSlide.id) {
        await setDoc(doc(db, 'hero_slides', currentSlide.id), payload, { merge: true });
        addToast('Hero slide updated', 'success');
      } else {
        await addDoc(collection(db, 'hero_slides'), { ...payload, createdAt: serverTimestamp() });
        addToast('Hero slide added', 'success');
      }
      setIsEditing(false);
      setCurrentSlide(null);
    } catch (e) {
      addToast('Failed to save hero slide', 'error');
      throw e;
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this slide?")) {
      try {
        await deleteDoc(doc(db, 'hero_slides', id));
        addToast('Hero slide deleted', 'success');
      } catch (e) {
        addToast('Failed to delete hero slide', 'error');
        throw e;
      }
    }
  };

  const openEdit = (slide = { title: '', subtitle: '', imageUrl: '' }) => {
    setHeroUploadError('');
    setCurrentSlide(slide);
    setIsEditing(true);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Header */}
      <div className="bg-white/50 p-6 rounded-[2rem] border border-border/40 backdrop-blur-sm flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-serif text-text-primary">Hero Slider</h2>
          <p className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mt-1">Homepage Visuals</p>
        </div>
        <button 
          onClick={() => openEdit()} 
          className="bg-text-primary text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-button shadow-lg flex gap-2 items-center transition-all"
        >
          <Plus size={16} /> Add Slide
        </button>
      </div>

      {/* Edit Form */}
      <AnimatePresence>
        {isEditing && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }}
            className="bg-white p-8 rounded-[2.5rem] border border-border/40 shadow-xl overflow-hidden"
          >
            <h3 className="text-lg font-serif text-text-primary mb-6">{currentSlide.id ? 'Edit Slide' : 'New Slide'}</h3>
            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Headline</label>
                <input 
                  value={currentSlide.title} 
                  onChange={(e) => setCurrentSlide({...currentSlide, title: e.target.value})}
                  className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors"
                  placeholder="e.g. Art of Wellness"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Subtitle</label>
                <input 
                  value={currentSlide.subtitle} 
                  onChange={(e) => setCurrentSlide({...currentSlide, subtitle: e.target.value})}
                  className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors"
                  placeholder="e.g. Crafted by nature"
                />
              </div>
              
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Background Image</label>
                <div className="flex gap-4 items-center p-4 bg-bg-surface/50 rounded-2xl border border-border/20 border-dashed">
                  <div className="w-20 h-20 bg-white rounded-xl border border-border/40 overflow-hidden flex-shrink-0">
                    {currentSlide.imageUrl ? (
                      <img src={currentSlide.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-secondary opacity-30"><ImageIcon size={24} /></div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                     <label className="inline-flex items-center gap-2 bg-white border border-border/40 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest cursor-pointer hover:bg-bg-main transition-colors">
                        <UploadCloud size={14} /> {uploadingHeroImage ? 'Uploading...' : 'Upload File'}
                        <input type="file" hidden accept="image/*" onChange={(e) => uploadHeroToCloudinary(e.target.files?.[0])} disabled={uploadingHeroImage} />
                     </label>
                     <input 
                        value={currentSlide.imageUrl} 
                        onChange={(e) => setCurrentSlide({...currentSlide, imageUrl: e.target.value})}
                        className="w-full bg-transparent text-xs border-b border-border/40 pb-1 outline-none text-text-secondary"
                        placeholder="Or paste image URL..."
                     />
                  </div>
                </div>
                {heroUploadError && <p className="text-red-500 text-xs mt-1">{heroUploadError}</p>}
              </div>

              <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t border-border/10">
                <button type="button" onClick={() => setIsEditing(false)} className="px-6 py-2 text-text-secondary text-xs font-bold uppercase tracking-widest hover:text-text-primary">Cancel</button>
                <button type="submit" className="bg-primary-button text-white px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-hover shadow-lg">Save Slide</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slide List */}
      <div className="grid gap-6">
        {loading ? (
          <div className="text-center italic text-text-secondary py-10">Loading visual stories...</div>
        ) : slides.length === 0 ? (
          <div className="text-center italic text-text-secondary py-10">No slides configured yet.</div>
        ) : (
          slides.map((slide) => (
            <div key={slide.id} className="bg-white p-6 rounded-[2rem] border border-border/40 shadow-sm flex flex-col md:flex-row gap-6 items-center group hover:shadow-md transition-all">
              <div className="w-full md:w-48 aspect-video bg-bg-surface rounded-xl overflow-hidden shadow-inner border border-border/20 relative">
                {slide.imageUrl ? (
                  <img src={slide.imageUrl} alt={slide.title} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-text-secondary opacity-30" />
                )}
              </div>

              <div className="flex-1 space-y-2 text-center md:text-left">
                <h3 className="font-serif text-xl text-text-primary">{slide.title || 'Untitled Slide'}</h3>
                <p className="text-xs uppercase tracking-widest text-text-secondary">{slide.subtitle || 'No subtitle'}</p>
              </div>

              <div className="flex gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(slide)} className="p-3 hover:bg-bg-surface rounded-full text-text-primary transition-colors">
                  <Edit2 size={18} />
                </button>
                <button onClick={() => handleDelete(slide.id)} className="p-3 hover:bg-red-50 text-text-secondary hover:text-red-500 rounded-full transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};

// 5. TESTIMONIALS (Similar Styling)
const TestimonialsManager = () => {
  const { addToast } = useToast();
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentTestimonial, setCurrentTestimonial] = useState(null);

  React.useEffect(() => {
    const q = query(collection(db, 'testimonials'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setTestimonials(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      name: currentTestimonial.name || '',
      text: currentTestimonial.text || '',
      rating: Number(currentTestimonial.rating || 5),
      updatedAt: serverTimestamp(),
    };

    try {
      if (currentTestimonial.id) {
        await setDoc(doc(db, 'testimonials', currentTestimonial.id), payload, { merge: true });
        addToast('Testimonial updated', 'success');
      } else {
        await addDoc(collection(db, 'testimonials'), { ...payload, createdAt: serverTimestamp() });
        addToast('Testimonial added', 'success');
      }
      setIsEditing(false);
      setCurrentTestimonial(null);
    } catch (e) {
      addToast('Failed to save testimonial', 'error');
      throw e;
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this review?")) {
      try {
        await deleteDoc(doc(db, 'testimonials', id));
        addToast('Testimonial deleted', 'success');
      } catch (e) {
        addToast('Failed to delete testimonial', 'error');
        throw e;
      }
    }
  };

  const openEdit = (t = { name: '', text: '', rating: 5 }) => {
    setCurrentTestimonial(t);
    setIsEditing(true);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Header */}
      <div className="bg-white/50 p-6 rounded-[2rem] border border-border/40 backdrop-blur-sm flex justify-between items-center">
         <div>
            <h2 className="text-3xl font-serif text-text-primary">Reviews</h2>
            <p className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mt-1">Customer Voices</p>
         </div>
         <button 
           onClick={() => openEdit()}
           className="bg-text-primary text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-button shadow-lg flex gap-2 items-center transition-all"
         >
           <Plus size={16} /> Add Review
         </button>
      </div>

      {/* Edit Form */}
      <AnimatePresence>
        {isEditing && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }}
            className="bg-white p-8 rounded-[2.5rem] border border-border/40 shadow-xl overflow-hidden"
          >
            <h3 className="text-lg font-serif text-text-primary mb-6">{currentTestimonial.id ? 'Edit Review' : 'New Review'}</h3>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Customer Name</label>
                  <input 
                    value={currentTestimonial.name} 
                    onChange={(e) => setCurrentTestimonial({...currentTestimonial, name: e.target.value})}
                    className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Rating (1-5)</label>
                  <div className="flex items-center gap-4 bg-bg-surface border border-border/40 rounded-xl px-4 py-2">
                    <input 
                      type="number" min="1" max="5" 
                      value={currentTestimonial.rating} 
                      onChange={(e) => setCurrentTestimonial({...currentTestimonial, rating: parseInt(e.target.value)})}
                      className="bg-transparent outline-none font-bold text-text-primary w-12"
                    />
                    <div className="flex text-yellow-400">
                      {[...Array(5)].map((_, i) => (
                         <Star key={i} size={16} className={i < currentTestimonial.rating ? "fill-current" : "text-border fill-transparent"} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                 <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Review Text</label>
                 <textarea 
                   rows="3"
                   value={currentTestimonial.text}
                   onChange={(e) => setCurrentTestimonial({...currentTestimonial, text: e.target.value})}
                   className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors resize-none"
                 />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
                <button type="button" onClick={() => setIsEditing(false)} className="px-6 py-2 text-text-secondary text-xs font-bold uppercase tracking-widest hover:text-text-primary">Cancel</button>
                <button type="submit" className="bg-primary-button text-white px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-hover shadow-lg">Save Review</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Review List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-2 text-center italic text-text-secondary py-10">Loading testimonials...</div>
        ) : testimonials.length === 0 ? (
          <div className="col-span-2 text-center italic text-text-secondary py-10">No reviews found.</div>
        ) : (
          testimonials.map((t) => (
            <div key={t.id} className="bg-white p-8 rounded-[2rem] border border-border/40 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow group">
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="font-serif text-lg text-text-primary">{t.name}</h4>
                    <p className="text-[10px] uppercase text-text-secondary tracking-wider">Verified Customer</p>
                  </div>
                  <div className="flex gap-1 bg-yellow-50 px-2 py-1 rounded-lg border border-yellow-100">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={12} className={i < t.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200 fill-gray-200"} />
                    ))}
                  </div>
                </div>
                <p className="text-text-secondary text-sm italic leading-relaxed">"{t.text}"</p>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border/10 opacity-60 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(t)} className="text-text-primary hover:text-primary-button"><Edit2 size={16} /></button>
                <button onClick={() => handleDelete(t.id)} className="text-text-secondary hover:text-red-500"><Trash2 size={16} /></button>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};

// 6. COMBO MANAGER
const ComboManager = () => {
  const { addToast } = useToast();
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCombo, setCurrentCombo] = useState(null);

  // Fetch combos from collection
  React.useEffect(() => {
    const q = query(collection(db, 'combos'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setCombos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    
    const payload = {
      name: currentCombo.name || '',
      price: Number(currentCombo.price || 0),
      description: currentCombo.description || '',
      template: currentCombo.template || 'all_core', // Default template
      active: Boolean(currentCombo.active),
      updatedAt: serverTimestamp(),
    };

    try {
      if (currentCombo.id) {
        await setDoc(doc(db, 'combos', currentCombo.id), payload, { merge: true });
        addToast('Combo updated', 'success');
      } else {
        await addDoc(collection(db, 'combos'), { ...payload, createdAt: serverTimestamp() });
        addToast('Combo created', 'success');
      }
      setIsEditing(false);
      setCurrentCombo(null);
    } catch (e) {
      addToast('Failed to save combo', 'error');
      console.error(e);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this combo?")) {
      try {
        await deleteDoc(doc(db, 'combos', id));
        addToast('Combo deleted', 'success');
      } catch (e) {
        addToast('Failed to delete combo', 'error');
      }
    }
  };

  const openEdit = (combo = { name: '', price: 0, description: '', template: 'all_core', active: true }) => {
    setCurrentCombo(combo);
    setIsEditing(true);
  };

  const TEMPLATES = [
    { value: 'all_core', label: 'Core Trio Logic (3 Core Items)' },
    { value: 'mixed', label: 'Signature Mix Logic (2 Core + 1 Sig)' },
    { value: 'gift_box', label: 'Gift Box Logic (1 Item + Goodies)' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Header */}
      <div className="bg-white/50 p-6 rounded-[2rem] border border-border/40 backdrop-blur-sm flex justify-between items-center">
         <div>
            <h2 className="text-3xl font-serif text-text-primary">Combos</h2>
            <p className="text-[10px] uppercase tracking-widest text-text-secondary font-bold mt-1">Manage Bundles</p>
         </div>
         <button 
           onClick={() => openEdit()}
           className="bg-text-primary text-white px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-button shadow-lg flex gap-2 items-center transition-all"
         >
           <Plus size={16} /> Create Combo
         </button>
      </div>

      {/* Edit Form */}
      <AnimatePresence>
        {isEditing && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }}
            className="bg-white p-8 rounded-[2.5rem] border border-border/40 shadow-xl overflow-hidden"
          >
            <h3 className="text-lg font-serif text-text-primary mb-6">{currentCombo.id ? 'Edit Combo' : 'New Combo'}</h3>
            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Display Name</label>
                <input 
                  value={currentCombo.name} 
                  onChange={(e) => setCurrentCombo({...currentCombo, name: e.target.value})}
                  className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors"
                  placeholder="e.g. Summer Start Kit"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Price (₹)</label>
                <input 
                  type="number"
                  value={currentCombo.price} 
                  onChange={(e) => setCurrentCombo({...currentCombo, price: Number(e.target.value)})}
                  className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors"
                  required
                />
              </div>

              <div className="space-y-2">
                 <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Logic Template</label>
                 <select 
                   value={currentCombo.template} 
                   onChange={(e) => setCurrentCombo({...currentCombo, template: e.target.value})}
                   className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none cursor-pointer"
                 >
                   {TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                 </select>
                 <p className="text-[10px] text-text-secondary italic">Determines the rules for selecting items.</p>
              </div>

              <div className="space-y-2">
                 <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Description</label>
                 <textarea 
                   rows="2"
                   value={currentCombo.description}
                   onChange={(e) => setCurrentCombo({...currentCombo, description: e.target.value})}
                   className="w-full bg-bg-surface border border-border/40 rounded-xl px-4 py-3 text-text-primary outline-none focus:border-primary-button transition-colors resize-none"
                   placeholder="Brief subtitle..."
                 />
              </div>

              <label className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl cursor-pointer border border-border/10 w-fit">
                <input 
                  type="checkbox" 
                  checked={currentCombo.active} 
                  onChange={e => setCurrentCombo({...currentCombo, active: e.target.checked})} 
                  className="accent-primary-button w-4 h-4" 
                />
                <span className="text-xs font-bold uppercase tracking-widest text-text-primary">Active on Site</span>
              </label>

              <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t border-border/10">
                <button type="button" onClick={() => setIsEditing(false)} className="px-6 py-2 text-text-secondary text-xs font-bold uppercase tracking-widest hover:text-text-primary">Cancel</button>
                <button type="submit" className="bg-primary-button text-white px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-hover shadow-lg">Save Combo</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-center italic text-text-secondary py-10">Loading combos...</div>
        ) : combos.length === 0 ? (
          <div className="col-span-full text-center italic text-text-secondary py-10">No combos created yet.</div>
        ) : (
          combos.map((combo) => (
            <div key={combo.id} className={`p-6 rounded-[2rem] border transition-all relative group ${combo.active ? 'bg-white border-border/40 shadow-sm hover:shadow-md' : 'bg-gray-50 border-gray-200 opacity-70'}`}>
               <div className="flex justify-between items-start mb-4">
                  <span className={`text-[9px] font-bold uppercase px-2 py-1 rounded-full ${combo.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                    {combo.active ? 'Active' : 'Hidden'}
                  </span>
                  <div className="flex gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(combo)} className="p-2 hover:bg-bg-surface rounded-full text-text-primary"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(combo.id)} className="p-2 hover:bg-red-50 text-text-secondary hover:text-red-500 rounded-full"><Trash2 size={14} /></button>
                  </div>
               </div>
               
               <h3 className="font-serif text-xl text-text-primary mb-1">{combo.name}</h3>
               <p className="text-2xl font-bold text-text-primary mb-4">₹{combo.price}</p>
               
               <div className="text-xs text-text-secondary space-y-1">
                 <p className="uppercase tracking-widest font-bold opacity-60">Logic: {TEMPLATES.find(t => t.value === combo.template)?.label || combo.template}</p>
                 <p className="italic">"{combo.description}"</p>
               </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};


// --- MAIN DASHBOARD LAYOUT ---

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('products');
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-[#F5F2F0] font-sans selection:bg-primary-button/10">
      {/* Elegant Sidebar */}
      <aside className="w-72 bg-white border-r border-border/40 flex flex-col fixed h-full z-20 shadow-2xl shadow-black/5">
        <div className="p-10 pb-6">
          <h1 className="text-3xl font-serif font-bold text-text-primary tracking-tight">The Prana Elixir</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-text-secondary mt-2 pl-1">Admin Console</p>
        </div>

        <nav className="flex-1 px-6 space-y-1 py-6 overflow-y-auto">
          {[
            { id: 'products', label: 'Inventory', icon: <Package size={18} /> },
            { id: 'orders', label: 'Orders', icon: <ShoppingCart size={18} /> },
            { id: 'combos', label: 'Combos', icon: <Tag size={18} /> },
            { id: 'hero', label: 'Hero Slider', icon: <ImageIcon size={18} /> },
            { id: 'testimonials', label: 'Reviews', icon: <MessageSquareQuote size={18} /> },
            { id: 'promo', label: 'Announcements', icon: <Tag size={18} /> }
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-full transition-all duration-300 group
                ${activeTab === item.id 
                  ? 'bg-text-primary text-white shadow-lg translate-x-1' 
                  : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary'}`}
            >
              {item.icon}
              <span className="text-xs font-bold uppercase tracking-widest">{item.label}</span>
              {activeTab === item.id && <ChevronRight size={14} className="ml-auto opacity-60" />}
            </button>
          ))}
        </nav>

        <div className="p-8 border-t border-border/10">
          <button onClick={async () => { await signOut(auth); navigate('/admin/login'); }} className="flex items-center gap-3 text-red-400 hover:text-red-600 transition-colors text-xs font-bold uppercase tracking-widest">
            <LogOut size={16} /> Secure Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-72 p-10 overflow-y-auto h-screen custom-scrollbar">
        {/* Top Bar */}
        {/* <header className="flex justify-end mb-10">
          <div className="bg-white border border-border/40 rounded-full px-5 py-3 flex items-center gap-3 text-text-secondary w-80 shadow-sm focus-within:shadow-md transition-shadow">
            <Search size={18} className="opacity-40" />
            <input placeholder="Search database..." className="bg-transparent border-none outline-none text-xs font-medium w-full text-text-primary" />
          </div>
        </header> */}

        {/* Dynamic View */}
        <AnimatePresence mode="wait">
           <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
             {activeTab === 'products' && <ProductsManager />}
             {activeTab === 'orders' && <OrdersManager />}
             {activeTab === 'combos' && <ComboManager />}
             {activeTab === 'hero' && <HeroManager />}
             {activeTab === 'testimonials' && <TestimonialsManager />}
             {activeTab === 'promo' && <PromoManager />}
           </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

export default AdminDashboard;