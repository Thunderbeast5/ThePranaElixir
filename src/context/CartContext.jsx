import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'

import { db } from '../firebase'
import { useAuth } from './useAuth'
import { useToast } from './useToast'

const CartContext = createContext(null)

function readLocalCart() {
  try {
    const raw = localStorage.getItem('cart')
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function writeLocalCart(items) {
  try {
    localStorage.setItem('cart', JSON.stringify(items))
  } catch {
    // ignore
  }
}

export function CartProvider({ children }) {
  const { user } = useAuth()
  const { addToast } = useToast()

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      Promise.resolve().then(() => setLoading(true))
      const q = collection(db, 'users', user.uid, 'cart')
      const unsub = onSnapshot(
        q,
        (snap) => {
          setItems(
            snap.docs
              .map((d) => ({
                id: d.id,
                ...d.data(),
                quantity: Number(d.data()?.quantity || 0),
                price: Number(d.data()?.price || 0),
              }))
              .filter((it) => it.quantity > 0),
          )
          setLoading(false)
        },
        () => {
          setLoading(false)
        },
      )
      return () => unsub()
    }

    const local = readLocalCart()
    Promise.resolve().then(() => {
      setItems(local)
      setLoading(false)
    })
  }, [user])

  useEffect(() => {
    if (!user) {
      writeLocalCart(items)
    }
  }, [items, user])

  const addItem = useCallback(
    async (product, quantity = 1) => {
      const qty = Math.max(1, Number(quantity || 1))
      const productId = String(product?.id || '')
      if (!productId) return

      const title = String(product?.name || product?.title || 'Item')

      try {
        if (!user) {
          setItems((prev) => {
            const existing = prev.find((p) => String(p.productId || p.id) === productId)
            if (existing) {
              return prev.map((p) =>
                String(p.productId || p.id) === productId
                  ? { ...p, quantity: Number(p.quantity || 0) + qty }
                  : p,
              )
            }
            return [
              ...prev,
              {
                id: productId,
                productId,
                title: product?.name || product?.title || '',
                price: Number(product?.price || 0),
                image: product?.imageUrl || product?.image || '',
                description: product?.description || '',
                category: product?.category || 'Standard',
                quantity: qty,
              },
            ]
          })
          addToast(`${title} added to cart`, 'success')
          return
        }

        const ref = doc(db, 'users', user.uid, 'cart', productId)
        const existing = items.find((it) => String(it.id) === productId)
        const nextQty = (existing?.quantity || 0) + qty

        await setDoc(
          ref,
          {
            productId,
            title: product?.name || product?.title || '',
            price: Number(product?.price || 0),
            image: product?.imageUrl || product?.image || '',
            // Store description/category for Custom Combos
            description: product?.description || '', 
            category: product?.category || 'Standard',
            quantity: nextQty,
            updatedAt: serverTimestamp(),
            ...(existing ? {} : { createdAt: serverTimestamp() }),
          },
          { merge: true },
        )

        addToast(`${title} added to cart`, 'success')
      } catch (e) {
        addToast('Failed to add item to cart', 'error')
        throw e
      }
    },
    [addToast, items, user],
  )

  const setItemQuantity = useCallback(
    async (productIdRaw, quantity) => {
      const productId = String(productIdRaw || '')
      if (!productId) return
      const qty = Number(quantity || 0)

      if (!user) {
        setItems((prev) => {
          if (qty <= 0) return prev.filter((p) => String(p.productId || p.id) !== productId)
          return prev.map((p) =>
            String(p.productId || p.id) === productId ? { ...p, quantity: qty } : p,
          )
        })
        return
      }

      const ref = doc(db, 'users', user.uid, 'cart', productId)
      if (qty <= 0) {
        await deleteDoc(ref)
        return
      }

      await setDoc(
        ref,
        {
          quantity: qty,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    },
    [user],
  )

  const removeItem = useCallback(
    async (productId) => {
      await setItemQuantity(productId, 0)
    },
    [setItemQuantity],
  )

  const clearCart = useCallback(async () => {
    if (!user) {
      setItems([])
      return
    }

    const snap = await getDocs(collection(db, 'users', user.uid, 'cart'))
    const batch = writeBatch(db)
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }, [user])

  const totalQuantity = useMemo(() => {
    return items.reduce((sum, it) => sum + Number(it.quantity || 0), 0)
  }, [items])

  const subtotal = useMemo(() => {
    return items.reduce((sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 0), 0)
  }, [items])

  const shipping = useMemo(() => {
    if (items.length === 0) return 0
    
    // Check if any item is a Combo or Gift Box
    // We need to look up the product category. Since cart items might not have category, 
    // we might need to rely on the name or fetch full product details.
    // However, looking at productsData.js, the names for Combos contain "Combo" and Gift Boxes contain "Gift Box" 
    // or we can try to pass category when adding to cart.
    // Let's check what's stored in the cart. 
    // The cart stores: id, productId, title, price, image, quantity.
    // It does NOT store category.
    // I should probably update the addItem function to store category as well, OR infer it from title.
    // Inferring from title "Combo" or "Gift Box" seems safest given the current data structure without a major refactor.
    
    // Actually, let's just check the titles for now as per the requirements.
    const hasComboOrGiftBox = items.some(item => 
      item.category === 'Combo' || 
      item.title?.toLowerCase().includes('combo') || 
      item.title?.toLowerCase().includes('gift box')
    )

    // return hasComboOrGiftBox ? 0 : 50
    return hasComboOrGiftBox ? 0 : 1
  }, [items])

  const value = useMemo(() => {
    return {
      items,
      loading,
      totalQuantity,
      subtotal,
      shipping, // Export shipping
      addItem,
      setItemQuantity,
      removeItem,
      clearCart,
    }
  }, [addItem, clearCart, items, loading, removeItem, setItemQuantity, subtotal, totalQuantity, shipping])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export { CartContext }
