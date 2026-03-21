import React, { useEffect, useMemo, useState } from 'react';
import { 
  User, Package, MapPin, Heart, LogOut, Camera, Save, X, ChevronRight, Trash2, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../Pages/Navbar';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../context/useToast';
import { updateProfile } from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs,
  limit, orderBy, query, serverTimestamp, setDoc, where
} from 'firebase/firestore';
import { db } from '../../firebase';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

void motion;

// --- UTILS ---
const getInitials = (name, email) => {
  const safeName = typeof name === 'string' ? name.trim() : '';
  if (safeName) {
    return safeName
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  const safeEmail = typeof email === 'string' ? email.trim() : '';
  if (safeEmail) {
    const localPart = safeEmail.split('@')[0] || '';
    return localPart.toUpperCase().slice(0, 2) || 'U';
  }

  return 'U';
};

// --- SUB-COMPONENTS ---

const ProfileTab = ({ user, onSave, saving, onAvatarUpload }) => {
  const [localUser, setLocalUser] = useState(user);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = React.useRef(null);

  useEffect(() => {
    setLocalUser(user);
  }, [user]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file && onAvatarUpload) {
      await onAvatarUpload(file);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex flex-col md:flex-row items-center gap-8 p-6 bg-bg-surface/30 rounded-3xl border border-border/50">
        <div className="relative group">
          <div className="w-28 h-28 rounded-full bg-primary-button flex items-center justify-center text-white text-3xl font-serif border-4 border-white shadow-xl">
            {getInitials(user.name, user.email)}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          {/* <button 
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-1 right-1 bg-white text-text-primary p-2 rounded-full shadow-lg hover:bg-primary-button hover:text-white transition-all cursor-pointer"
          >
            <Camera size={16} />
          </button> */}
        </div>
        <div className="text-center md:text-left">
          <h2 className="text-3xl font-serif text-text-primary">{user.name}</h2>
          <p className="text-text-secondary tracking-widest text-sm uppercase mt-1">{user.email}</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-border/60 shadow-sm">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-[0.2em]">Account Settings</h3>
          <button 
            onClick={() => setIsEditing(!isEditing)} 
            className="text-primary-button text-xs font-bold uppercase tracking-widest hover:underline"
          >
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </button>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); onSave(localUser); setIsEditing(false); }} className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {['name', 'email', 'phone'].map((field) => (
            <div key={field} className="space-y-3">
              <label className="text-[10px] font-bold uppercase text-text-secondary tracking-widest">
                {field === 'name' ? 'Full Name' : field === 'email' ? 'Email' : 'Phone'}
              </label>
              <input 
                disabled={!isEditing || field === 'email'}
                value={localUser[field] || ''}
                onChange={(e) => setLocalUser({...localUser, [field]: e.target.value})}
                className="w-full bg-bg-main/50 border-b border-border py-2 text-text-primary focus:border-primary-button transition-colors outline-none disabled:opacity-50"
              />
            </div>
          ))}
          <AnimatePresence>
            {isEditing && (
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="md:col-span-2 flex justify-end"
              >
                <button 
                  type="submit" 
                  disabled={saving} 
                  className="bg-text-primary text-white px-10 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-primary-button transition-all disabled:opacity-50"
                >
                  {saving ? 'Processing...' : 'Save Changes'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </div>
    </motion.div>
  );
};

const OrdersTab = ({ orders, loading, onOpenOrder }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
    <h3 className="text-xs font-bold text-text-primary uppercase tracking-[0.2em] mb-8">Order History</h3>
    {loading ? (
      <div className="py-10 text-center text-text-secondary italic">Loading your treasures...</div>
    ) : orders.length === 0 ? (
      <div className="py-20 text-center bg-bg-surface/20 rounded-3xl border border-dashed border-border">
        <Package className="mx-auto text-border mb-4" size={40} />
        <p className="text-text-secondary italic">Your order history is currently empty.</p>
      </div>
    ) : (
      orders.map((order) => (
        <button
          key={order.id}
          type="button"
          onClick={() => onOpenOrder && onOpenOrder(order)}
          className="group w-full text-left bg-white border border-border/60 rounded-2xl p-6 hover:shadow-xl transition-all duration-500"
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-border/30 pb-4">
            <div>
              <span className=" text-xl text-text-primary">{order.id}</span>
              <p className="text-text-secondary text-xs uppercase tracking-tighter mt-1">{order.date}</p>
            </div>
            <div className="mt-4 md:mt-0 flex items-center gap-6">
              <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all
                ${order.status === 'Delivered' ? 'bg-green-50 text-green-600' : 
                order.status === 'Shipped' ? 'bg-blue-50 text-blue-600' :
                order.status === 'Processing' ? 'bg-yellow-50 text-yellow-600' :
                order.status === 'Cancelled' ? 'bg-red-50 text-red-600' :
                'bg-orange-50 text-orange-600'
              }`}>
                {order.status}
              </span>
              <span className="font-bold text-text-primary">Rs. {order.total.toLocaleString()}</span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <p className="text-xs text-text-secondary uppercase tracking-wide truncate max-w-md">
              {order.items.join(" • ")}
            </p>
            <span className="text-text-primary group-hover:text-primary-button transition-colors">
              <ChevronRight size={20}/>
            </span>
          </div>
        </button>
      ))
    )}
  </motion.div>
);

// Address Modal Component
const AddressModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  formData, 
  setFormData, 
  saving,
  validationErrors = {},
  isVerifyingPin = false,
  pinCodeVerified = false,
  handlePinCodeChange
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-text-primary/40 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden"
        >
          <div className="p-8 md:p-12">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-serif text-text-primary tracking-tight">Add New Address</h3>
              <button onClick={onClose} className="text-text-secondary hover:text-text-primary transition-colors">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={onSave} className="space-y-8">
              {/* Address Type Selection */}
              <div className="flex gap-4">
                {['Home', 'Work', 'Other'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, type })}
                    className={`px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all
                      ${formData.type === type 
                        ? 'bg-text-primary text-white border-text-primary' 
                        : 'bg-transparent text-text-secondary border-border hover:border-text-primary'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Input Fields */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-1 border-b border-border/40 pb-2 col-span-1">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">First Name</label>
                  <input 
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className={`w-full bg-transparent outline-none text-text-primary py-1 ${validationErrors.firstName ? 'border-red-400' : ''}`}
                  />
                  {validationErrors.firstName && (
                    <p className="text-[9px] text-red-500 mt-1">{validationErrors.firstName}</p>
                  )}
                </div>
                <div className="space-y-1 border-b border-border/40 pb-2 col-span-1">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">Last Name</label>
                  <input 
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className={`w-full bg-transparent outline-none text-text-primary py-1 ${validationErrors.lastName ? 'border-red-400' : ''}`}
                  />
                  {validationErrors.lastName && (
                    <p className="text-[9px] text-red-500 mt-1">{validationErrors.lastName}</p>
                  )}
                </div>
                <div className="space-y-1 border-b border-border/40 pb-2 col-span-2">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">Address Line</label>
                  <input 
                    required
                    value={formData.addressLine}
                    onChange={(e) => setFormData({ ...formData, addressLine: e.target.value })}
                    className={`w-full bg-transparent outline-none text-text-primary py-1 ${validationErrors.addressLine ? 'border-red-400' : ''}`}
                    placeholder="Street, Apartment, Suite"
                  />
                  {validationErrors.addressLine && (
                    <p className="text-[9px] text-red-500 mt-1">{validationErrors.addressLine}</p>
                  )}
                </div>
                <div className="space-y-1 border-b border-border/40 pb-2 col-span-1">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">City</label>
                  <input 
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className={`w-full bg-transparent outline-none text-text-primary py-1 ${validationErrors.city ? 'border-red-400' : ''}`}
                    readOnly={pinCodeVerified}
                  />
                  {validationErrors.city && (
                    <p className="text-[9px] text-red-500 mt-1">{validationErrors.city}</p>
                  )}
                  {pinCodeVerified && (
                    <p className="text-[9px] text-green-600 mt-1">✓ Auto-filled from PIN</p>
                  )}
                </div>
                <div className="space-y-1 border-b border-border/40 pb-2 col-span-1">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">State</label>
                  <input 
                    required
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className={`w-full bg-transparent outline-none text-text-primary py-1 ${validationErrors.state ? 'border-red-400' : ''}`}
                    readOnly={pinCodeVerified}
                  />
                  {validationErrors.state && (
                    <p className="text-[9px] text-red-500 mt-1">{validationErrors.state}</p>
                  )}
                  {pinCodeVerified && (
                    <p className="text-[9px] text-green-600 mt-1">✓ Auto-filled from PIN</p>
                  )}
                </div>
                <div className="space-y-1 border-b border-border/40 pb-2 col-span-2 relative">
                  <label className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">Pincode</label>
                  <div className="relative">
                    <input 
                      required
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={formData.postalCode}
                      onChange={handlePinCodeChange}
                      className={`w-full bg-transparent outline-none text-text-primary py-1 pr-8 ${validationErrors.postalCode ? 'border-red-400' : ''}`}
                      placeholder="Enter 6-digit PIN code"
                    />
                    {isVerifyingPin && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-primary-button border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    {pinCodeVerified && !isVerifyingPin && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 text-green-600">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {validationErrors.postalCode && (
                    <p className="text-[9px] text-red-500 mt-1">{validationErrors.postalCode}</p>
                  )}
                  {pinCodeVerified && !validationErrors.postalCode && (
                    <p className="text-[9px] text-green-600 mt-1">✓ PIN code verified</p>
                  )}
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={saving}
                type="submit"
                className="w-full bg-text-primary text-white py-4 rounded-2xl text-xs font-bold uppercase tracking-[0.2em] shadow-lg hover:bg-primary-button transition-colors disabled:opacity-50"
              >
                {saving ? "Saving Treasure..." : "Save Address"}
              </motion.button>
            </form>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const AddressesTab = ({ addresses, onAdd, onRemove, loading, saving }) => {
  const [showModal, setShowModal] = useState(false);
  const [addressForm, setAddressForm] = useState({
    type: 'Home',
    firstName: '',
    lastName: '',
    addressLine: '',
    city: '',
    state: '',
    postalCode: ''
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [pinCodeVerified, setPinCodeVerified] = useState(false);

  // Validation functions
  const validateName = (name) => {
    const nameRegex = /^[a-zA-Z\s]{2,50}$/;
    return nameRegex.test(name);
  };

  const validatePinCode = (pin) => {
    const pinRegex = /^[1-9][0-9]{5}$/;
    return pinRegex.test(pin);
  };

  const validateAddress = () => {
    const errors = {};

    if (!addressForm.firstName.trim()) {
      errors.firstName = 'First name is required';
    } else if (!validateName(addressForm.firstName)) {
      errors.firstName = 'Please enter a valid first name (2-50 characters, letters only)';
    }

    if (!addressForm.lastName.trim()) {
      errors.lastName = 'Last name is required';
    } else if (!validateName(addressForm.lastName)) {
      errors.lastName = 'Please enter a valid last name (2-50 characters, letters only)';
    }

    if (!addressForm.addressLine.trim()) {
      errors.addressLine = 'Address is required';
    } else if (addressForm.addressLine.length < 10) {
      errors.addressLine = 'Please enter a complete address (minimum 10 characters)';
    }

    if (!addressForm.city.trim()) {
      errors.city = 'City is required';
    }

    if (!addressForm.state.trim()) {
      errors.state = 'State is required';
    }

    if (!addressForm.postalCode.trim()) {
      errors.postalCode = 'PIN code is required';
    } else if (!validatePinCode(addressForm.postalCode)) {
      errors.postalCode = 'Please enter a valid 6-digit PIN code';
    } else if (!pinCodeVerified) {
      errors.postalCode = 'Please verify the PIN code';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Verify PIN code and auto-fill city/state
  const verifyPinCode = async (pinCode) => {
    if (!validatePinCode(pinCode)) {
      setValidationErrors(prev => ({ ...prev, postalCode: 'Invalid PIN code format' }));
      setPinCodeVerified(false);
      return;
    }

    setIsVerifyingPin(true);
    setValidationErrors(prev => ({ ...prev, postalCode: '' }));

    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${pinCode}`);
      const data = await response.json();

      if (data[0].Status === 'Success' && data[0].PostOffice && data[0].PostOffice.length > 0) {
        const postOffice = data[0].PostOffice[0];
        
        setAddressForm(prev => ({
          ...prev,
          city: postOffice.District || prev.city,
          state: postOffice.State || prev.state
        }));
        
        setPinCodeVerified(true);
        setValidationErrors(prev => ({ ...prev, postalCode: '' }));
      } else {
        setValidationErrors(prev => ({ 
          ...prev, 
          postalCode: 'PIN code not found. Please enter a valid Indian PIN code' 
        }));
        setPinCodeVerified(false);
      }
    } catch (error) {
      console.error('Error verifying PIN code:', error);
      setValidationErrors(prev => ({ 
        ...prev, 
        postalCode: 'Unable to verify PIN code. Please check your internet connection' 
      }));
      setPinCodeVerified(false);
    } finally {
      setIsVerifyingPin(false);
    }
  };

  // Handle PIN code change
  const handlePinCodeChange = (e) => {
    const pin = e.target.value.replace(/\D/g, '').slice(0, 6);
    setAddressForm({ ...addressForm, postalCode: pin });
    setPinCodeVerified(false);
    
    if (pin.length === 6) {
      verifyPinCode(pin);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateAddress()) {
      return;
    }

    await onAdd(addressForm);
    setAddressForm({
      type: 'Home',
      firstName: '',
      lastName: '',
      addressLine: '',
      city: '',
      state: '',
      postalCode: ''
    });
    setValidationErrors({});
    setPinCodeVerified(false);
    setShowModal(false);
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-bold text-text-primary uppercase tracking-[0.2em]">Saved Addresses</h3>
          <button 
            onClick={() => setShowModal(true)} 
            className="bg-text-primary text-white px-6 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-primary-button transition-all flex items-center gap-2"
          >
            <Plus size={14} /> Add New
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-text-secondary italic">Loading addresses...</div>
        ) : addresses.length === 0 ? (
          <div className="py-20 text-center bg-bg-surface/20 rounded-3xl border border-dashed border-border">
            <MapPin className="mx-auto text-border mb-4" size={40} />
            <p className="text-text-secondary italic">No saved addresses yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {addresses.map(addr => (
              <div key={addr.id} className="bg-white border border-border p-8 rounded-[2rem] flex flex-col justify-between min-h-[12rem] hover:shadow-lg transition-shadow">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary-button mb-2 block">
                    {addr.type}
                  </span>
                  <p className="text-text-primary font-serif text-lg mb-2">
                    {addr.firstName} {addr.lastName}
                  </p>
                  <p className="text-text-secondary text-sm">
                    {addr.addressLine}
                  </p>
                  <p className="text-text-secondary text-sm">
                    {addr.city}, {addr.state} {addr.postalCode}
                  </p>
                </div>
                <button 
                  onClick={() => onRemove(addr.id)} 
                  className="text-red-400 hover:text-red-600 self-end mt-4"
                >
                  <Trash2 size={18}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Address Modal */}
      <AddressModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setValidationErrors({});
          setPinCodeVerified(false);
        }}
        onSave={handleSubmit}
        formData={addressForm}
        setFormData={setAddressForm}
        saving={saving}
        validationErrors={validationErrors}
        isVerifyingPin={isVerifyingPin}
        pinCodeVerified={pinCodeVerified}
        handlePinCodeChange={handlePinCodeChange}
      />
    </>
  );
};

const WishlistTab = ({ wishlist, loading, onRemove }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
    <h3 className="text-xs font-bold text-text-primary uppercase tracking-[0.2em] mb-8">My Wishlist</h3>
    {loading ? (
      <div className="py-10 text-center text-text-secondary italic">Loading your treasures...</div>
    ) : wishlist.length === 0 ? (
      <div className="py-20 text-center bg-bg-surface/20 rounded-3xl border border-dashed border-border">
        <Heart className="mx-auto text-border mb-4" size={40} />
        <p className="text-text-secondary italic">Your wishlist is empty.</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {wishlist.map((item) => (
          <div key={item.id} className="group bg-white border border-border/60 rounded-2xl overflow-hidden hover:shadow-xl transition-all duration-500">
            <div className="aspect-square bg-bg-surface/30 relative overflow-hidden">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-secondary">
                  No Image
                </div>
              )}
              <button
                onClick={() => onRemove(item.id)}
                className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-red-400 p-2 rounded-full hover:text-red-600 hover:bg-white transition-all"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="p-4">
              <h4 className="font-serif text-lg text-text-primary mb-1">{item.name}</h4>
              <p className="text-text-secondary text-sm mb-2">{item.category}</p>
              <p className="font-bold text-text-primary">Rs. {item.price?.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    )}
  </motion.div>
);

// --- MAIN PAGE ---

const CustomerProfile = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const navigate = useNavigate();
  const { user, logout, loading } = useAuth();
  const { addToast } = useToast();
  const [profileDoc, setProfileDoc] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);

  const profileUser = useMemo(() => {
    if (!user) return { name: "Guest", email: "", phone: "", avatar: null };
    return {
      name: profileDoc?.name || user.displayName || "User",
      email: profileDoc?.email || user.email,
      phone: profileDoc?.phone || "",
      avatar: profileDoc?.avatarUrl || user.photoURL || null,
    }
  }, [user, profileDoc]);

  // Profile Save Handler
  const handleSaveProfile = async (nextUser) => {
    if (!user) return;
    setSaving(true);
    try {
      const updateData = {
        name: nextUser.name,
        phone: nextUser.phone,
        updatedAt: serverTimestamp()
      };
      
      await setDoc(doc(db, 'users', user.uid), updateData, { merge: true });
      
      if (nextUser.name !== user.displayName) {
        await updateProfile(user, { displayName: nextUser.name });
      }
      
      setProfileDoc(prev => ({ ...prev, ...updateData }));
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Avatar Upload Handler
  const handleAvatarUpload = async (file) => {
    if (!user) return;
    setSaving(true);
    try {
      const storage = getStorage();
      const storageRef = ref(storage, `avatars/${user.uid}/${Date.now()}_${file.name}`);
      
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      await setDoc(doc(db, 'users', user.uid), {
        avatarUrl: downloadURL,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      await updateProfile(user, { photoURL: downloadURL });
      
      setProfileDoc(prev => ({ ...prev, avatarUrl: downloadURL }));
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Failed to upload avatar. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Address Handlers
  const handleAddAddress = async (addressData) => {
    if (!user) return;
    setSaving(true);
    try {
      const docRef = await addDoc(collection(db, 'users', user.uid, 'addresses'), {
        ...addressData,
        createdAt: serverTimestamp()
      });
      
      setAddresses(prev => [...prev, { id: docRef.id, ...addressData }]);
    } catch (error) {
      console.error('Error adding address:', error);
      alert('Failed to add address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAddress = async (id) => {
    if (!user) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'addresses', id));
      setAddresses(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error removing address:', error);
      alert('Failed to remove address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Wishlist Handler
  const handleRemoveFromWishlist = async (productId) => {
    if (!user) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'wishlist', productId));
      setWishlist(prev => prev.filter(item => item.id !== productId));
      addToast('Removed from wishlist', 'success');
    } catch (error) {
      console.error('Error removing from wishlist:', error);
      addToast('Failed to remove item. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      navigate('/customer/login');
    }
  }, [loading, user, navigate]);
  
  // Fetch all user data
  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoadingData(true);
      
      try {
        // Fetch user profile
        const userDocRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
          setProfileDoc(userSnap.data());
        }

        // Fetch addresses
        const addressesSnap = await getDocs(collection(db, 'users', user.uid, 'addresses'));
        setAddresses(addressesSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Fetch wishlist
        const wishlistSnap = await getDocs(collection(db, 'users', user.uid, 'wishlist'));
        setWishlist(wishlistSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Fetch orders
        const ordersQuery = query(
          collection(db, 'orders'),
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc'),
          limit(10)
        );
        const ordersSnap = await getDocs(ordersQuery);
        
        setOrders(ordersSnap.docs.map(d => {
          const data = d.data();
          return {
            firestoreOrderId: d.id,
            id: data.orderNumber || `#${d.id.slice(0, 6).toUpperCase()}`,
            date: data.createdAt?.toDate().toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            }) || 'N/A',
            total: data.total || 0,
            status: data.status || 'Processing',
            items: (data.items || []).map(i => i.name || 'Item')
          };
        }));
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [user]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center font-serif text-xl tracking-widest animate-pulse">
        The Prana Elixir...
      </div>
    );
  }

  const menuItems = [
    { id: 'profile', label: 'Identity', icon: <User size={18} /> },
    { id: 'orders', label: 'History', icon: <Package size={18} /> },
    { id: 'addresses', label: 'Address', icon: <MapPin size={18} /> },
    { id: 'wishlist', label: 'Wishlist', icon: <Heart size={18} /> },
  ];

  const handleOpenOrder = (order) => {
    const id = String(order?.firestoreOrderId || '').trim();
    if (!id) return;
    navigate(`/orders/${id}`);
  };

  return (
    <div className="min-h-screen bg-bg-main selection:bg-primary-button/10">
      <Navbar />

      <div className="max-w-7xl mx-auto px-6 py-16">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-12">
          <h1 className="text-4xl md:text-5xl font-serif text-text-primary">My Profile</h1>
          <p className="text-text-secondary mt-3 tracking-[0.2em] text-xs uppercase font-bold">
            Welcome back, {profileUser.name}
          </p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* SIDEBAR */}
          <aside className="w-full lg:w-72 lg:sticky lg:top-24 lg:self-start">
            <div className="bg-white/40 backdrop-blur-xl border border-white/60 rounded-[2.5rem] p-4 shadow-xl">
              <nav className="flex flex-col space-y-2">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-4 px-6 py-4 rounded-full text-xs font-bold uppercase tracking-widest transition-all
                      ${activeTab === item.id 
                        ? 'bg-text-primary text-white shadow-lg' 
                        : 'text-text-secondary hover:bg-white hover:text-text-primary'
                      }`}
                  >
                    {item.icon} {item.label}
                  </button>
                ))}
                <button 
                  onClick={async () => { 
                    await logout(); 
                    navigate('/customer/login'); 
                  }}
                  className="flex items-center gap-4 px-6 py-4 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-50 rounded-full transition-all mt-6"
                >
                  <LogOut size={18} /> Log Out
                </button>
              </nav>
            </div>
          </aside>

          {/* CONTENT */}
          <main className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div 
                key={activeTab} 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: -20 }} 
                transition={{ duration: 0.3 }}
              >
                {activeTab === 'profile' && (
                  <ProfileTab 
                    user={profileUser} 
                    onSave={handleSaveProfile} 
                    onAvatarUpload={handleAvatarUpload}
                    saving={saving} 
                  />
                )}
                
                {activeTab === 'orders' && (
                  <OrdersTab orders={orders} loading={loadingData} onOpenOrder={handleOpenOrder} />
                )}
                
                {activeTab === 'addresses' && (
                  <AddressesTab 
                    addresses={addresses} 
                    onAdd={handleAddAddress}
                    onRemove={handleRemoveAddress}
                    loading={loadingData}
                    saving={saving}
                  />
                )}
                
                {activeTab === 'wishlist' && (
                  <WishlistTab 
                    wishlist={wishlist} 
                    loading={loadingData}
                    onRemove={handleRemoveFromWishlist}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
};

export default CustomerProfile;