import 'dotenv/config'
import process from 'node:process'
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import admin from 'firebase-admin'
import Razorpay from 'razorpay'

const app = express()

app.use(express.json({ limit: '1mb' }))
app.use(
  cors({
    origin: (origin, cb) => cb(null, true),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

const PORT = Number(process.env.PORT || 8080)

const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.warn('Missing FIREBASE_SERVICE_ACCOUNT_JSON env var. Firebase Admin will not initialize.')
}

if (FIREBASE_SERVICE_ACCOUNT_JSON) {
  const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON)
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

const db = () => admin.firestore()

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    const err = new Error('Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET')
    err.code = 'missing_razorpay_env'
    throw err
  }

  return {
    keyId,
    keySecret,
    client: new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    }),
  }
}

async function requireFirebaseAuth(req, res, next) {
  try {
    const auth = req.header('authorization') || ''
    const match = auth.match(/^Bearer\s+(.+)$/i)
    if (!match) {
      return res.status(401).json({ error: 'missing_auth', message: 'Missing Authorization: Bearer <token>' })
    }

    if (!admin.apps.length) {
      return res.status(500).json({ error: 'firebase_not_initialized', message: 'Firebase Admin not initialized' })
    }

    const decoded = await admin.auth().verifyIdToken(match[1])
    req.user = decoded
    return next()
  } catch {
    return res.status(401).json({ error: 'invalid_auth', message: 'Invalid Firebase token' })
  }
}

let shiprocketTokenCache = {
  token: null,
  fetchedAt: 0,
}

function getShiprocketBaseUrl() {
  return process.env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1/external'
}

async function getShiprocketToken() {
  const now = Date.now()
  const ageMs = now - (shiprocketTokenCache.fetchedAt || 0)

  // Shiprocket tokens usually last for days; keep a conservative cache window.
  if (shiprocketTokenCache.token && ageMs < 12 * 60 * 60 * 1000) {
    return shiprocketTokenCache.token
  }

  const email = process.env.SHIPROCKET_EMAIL
  const password = process.env.SHIPROCKET_PASSWORD

  if (!email || !password) {
    throw new Error('Missing SHIPROCKET_EMAIL or SHIPROCKET_PASSWORD')
  }

  const baseUrl = getShiprocketBaseUrl()
  const url = `${baseUrl}/auth/login`

  const resp = await axios.post(url, { email, password }, { timeout: 15000 })
  const token = resp?.data?.token
  if (!token) {
    throw new Error('Failed to get Shiprocket token')
  }

  shiprocketTokenCache = { token, fetchedAt: now }
  return token
}

function toShiprocketOrderPayload({ order, overrides }) {
  const shippingAddress = order?.shippingAddress || {}

  const firstName = String(shippingAddress.firstName || '').trim()
  const lastName = String(shippingAddress.lastName || '').trim()
  const customerName = `${firstName} ${lastName}`.trim() || 'Customer'

  const address = String(shippingAddress.address || '').trim()
  const city = String(shippingAddress.city || '').trim()
  const pincode = String(shippingAddress.postalCode || '').trim()

  const phone = String(overrides?.phone || order?.customerPhone || '').trim()
  const state = String(overrides?.state || order?.shippingAddress?.state || '').trim()
  const country = String(overrides?.country || order?.shippingAddress?.country || 'India').trim()

  if (!address || !city || !pincode || !phone || !state) {
    const missing = {
      address: !address,
      city: !city,
      pincode: !pincode,
      phone: !phone,
      state: !state,
    }
    const err = new Error('Missing required address fields for Shiprocket')
    err.details = missing
    throw err
  }

  const items = Array.isArray(order?.items) ? order.items : []
  if (items.length === 0) {
    throw new Error('Order has no items')
  }

  const orderNumber = String(order?.orderNumber || order?.id || '').trim() || `ORD-${Date.now()}`

  return {
    order_id: orderNumber,
    order_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',

    billing_customer_name: customerName,
    billing_last_name: lastName,
    billing_address: address,
    billing_city: city,
    billing_pincode: pincode,
    billing_state: state,
    billing_country: country,
    billing_email: String(order?.customerEmail || ''),
    billing_phone: phone,

    shipping_is_billing: true,

    order_items: items.map((it) => ({
      name: String(it.title || 'Item'),
      sku: String(it.productId || it.id || it.title || 'sku'),
      units: Number(it.quantity || 1),
      selling_price: Number(it.price || 0),
      discount: 0,
      tax: 0,
      hsn: String(it.hsn || ''),
    })),

    payment_method: 'Prepaid',
    sub_total: Number(order?.subtotal || order?.total || 0),

    length: Number(overrides?.length || 10),
    breadth: Number(overrides?.breadth || 10),
    height: Number(overrides?.height || 5),
    weight: Number(overrides?.weight || 0.5),
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

// Create Razorpay order + create Firestore order document
app.post('/razorpay/create-order', requireFirebaseAuth, async (req, res) => {
  try {
    const total = Number(req.body?.total || 0)
    const subtotal = Number(req.body?.subtotal || 0)
    const discount = Number(req.body?.discount || 0)
    const shipping = Number(req.body?.shipping || 0)
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    const shippingAddress = req.body?.shippingAddress || {}
    const customerEmail = String(req.body?.customerEmail || '')

    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ error: 'invalid_total', message: 'Invalid total amount.' })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'empty_cart', message: 'Cart is empty.' })
    }
    if (!admin.apps.length) {
      return res.status(500).json({ error: 'firebase_not_initialized', message: 'Firebase Admin not initialized' })
    }

    const { client, keyId } = getRazorpayClient()

    const orderRef = await db().collection('orders').add({
      userId: String(req.user.uid || ''),
      customerEmail,
      items: items.map((it) => ({
        productId: String(it.productId || it.id || ''),
        title: String(it.title || ''),
        price: Number(it.price || 0),
        quantity: Number(it.quantity || 0),
        image: String(it.image || ''),
      })),
      subtotal: Number(subtotal || 0),
      discount: Number(discount || 0),
      shipping: Number(shipping || 0),
      total: Number(total || 0),
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      status: 'Pending',
      adminInstruction: '',
      shippingAddress: {
        firstName: String(shippingAddress.firstName || '').trim(),
        lastName: String(shippingAddress.lastName || '').trim(),
        address: String(shippingAddress.address || '').trim(),
        city: String(shippingAddress.city || '').trim(),
        postalCode: String(shippingAddress.postalCode || '').trim(),
        state: String(shippingAddress.state || '').trim(),
        phone: String(shippingAddress.phone || '').trim(),
        savedAddressId: shippingAddress.savedAddressId || null,
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    const orderNumber = `ORD-${orderRef.id.slice(0, 8).toUpperCase()}`
    await orderRef.set({ orderNumber }, { merge: true })

    const amountPaise = Math.round(total * 100)
    const rzpOrder = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: orderRef.id,
      notes: {
        firestoreOrderId: orderRef.id,
        orderNumber,
        userId: String(req.user.uid || ''),
      },
    })

    await orderRef.set(
      {
        razorpay: {
          orderId: rzpOrder.id,
          amount: amountPaise,
          currency: rzpOrder.currency,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return res.json({
      firestoreOrderId: orderRef.id,
      orderNumber,
      razorpayOrderId: rzpOrder.id,
      amount: amountPaise,
      currency: rzpOrder.currency,
      keyId,
    })
  } catch (e) {
    const status = e?.code === 'missing_razorpay_env' ? 500 : 500
    return res.status(status).json({
      error: 'razorpay_create_order_failed',
      message: e?.message || 'Failed to create Razorpay order.',
    })
  }
})

// Verify Razorpay payment signature and mark Firestore order as paid
app.post('/razorpay/verify-payment', requireFirebaseAuth, async (req, res) => {
  try {
    const firestoreOrderId = String(req.body?.firestoreOrderId || '')
    const razorpay_order_id = String(req.body?.razorpay_order_id || '')
    const razorpay_payment_id = String(req.body?.razorpay_payment_id || '')
    const razorpay_signature = String(req.body?.razorpay_signature || '')

    if (!firestoreOrderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'missing_payment_details', message: 'Missing payment details' })
    }

    const { keySecret } = getRazorpayClient()

    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    if (generatedSignature !== razorpay_signature) {
      return res.status(403).json({ error: 'invalid_signature', message: 'Invalid payment signature' })
    }

    const orderRef = db().collection('orders').doc(firestoreOrderId)
    const snap = await orderRef.get()
    if (!snap.exists) {
      return res.status(404).json({ error: 'order_not_found', message: 'Order not found' })
    }

    const order = snap.data() || {}
    if (String(order.userId || '') !== String(req.user.uid || '')) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You do not have permission to modify this order.',
      })
    }

    await orderRef.set(
      {
        paymentStatus: 'paid',
        status: 'Processing',
        razorpay: {
          ...(order.razorpay || {}),
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return res.json({ ok: true })
  } catch (e) {
    return res.status(500).json({
      error: 'razorpay_verify_failed',
      message: e?.message || 'Verification failed.',
    })
  }
})

function normalizeOrderStatus(status) {
  return String(status || '').trim().toLowerCase()
}

function isOrderCancellable(order) {
  const status = normalizeOrderStatus(order?.status)
  if (!status) return true
  if (status === 'cancelled' || status === 'canceled') return false
  if (status === 'shipped' || status === 'delivered') return false
  return true
}

// Cancel an order (customer-owned, only before shipment)
app.post('/orders/:orderId/cancel', requireFirebaseAuth, async (req, res) => {
  try {
    const orderId = String(req.params.orderId || '').trim()
    if (!orderId) return res.status(400).json({ error: 'missing_order_id' })

    const reason = String(req.body?.reason || '').trim()

    const orderRef = db().collection('orders').doc(orderId)
    const snap = await orderRef.get()
    if (!snap.exists) {
      return res.status(404).json({ error: 'order_not_found', message: 'Order not found' })
    }

    const order = snap.data() || {}
    if (String(order.userId || '') !== String(req.user.uid || '')) {
      return res.status(403).json({ error: 'forbidden', message: 'You cannot cancel this order' })
    }

    if (!isOrderCancellable(order)) {
      return res.status(400).json({
        error: 'order_not_cancellable',
        message: 'This order can no longer be cancelled.',
      })
    }

    const refundNote = 'Refund will be processed within 5-7 business days to your original payment method.'

    await orderRef.set(
      {
        status: 'Cancelled',
        cancel: {
          reason: reason || null,
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
          cancelledBy: 'customer',
          refundNote,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return res.json({ ok: true, refundNote })
  } catch (e) {
    return res.status(500).json({ error: 'cancel_failed', message: e?.message || 'Failed to cancel order' })
  }
})

// Create Shiprocket order/shipment for an existing Firestore order
app.post('/shiprocket/create', requireFirebaseAuth, async (req, res) => {
  try {
    const { firestoreOrderId, overrides } = req.body || {}

    if (!firestoreOrderId) {
      return res.status(400).json({ error: 'missing_firestoreOrderId' })
    }

    const orderRef = db().collection('orders').doc(String(firestoreOrderId))
    const snap = await orderRef.get()
    if (!snap.exists) {
      return res.status(404).json({ error: 'order_not_found' })
    }

    const order = { id: snap.id, ...snap.data() }

    console.log('--- DEBUG SHIPROCKET AUTH ---');
    console.log('Order ID:', order.id);
    console.log('Order User ID:', order.userId); // This is likely undefined/null
    console.log('Request User UID:', req.user.uid);

    // Only allow the owner (or admins if you add claims later)
    if (String(order.userId || '') !== String(req.user.uid || '')) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'You are not allowed to create shipment for this order',
      })
    }

    if (String(order.paymentStatus || '') !== 'paid') {
      return res.status(400).json({
        error: 'order_not_paid',
        message: 'Shiprocket order can be created only after payment is paid',
      })
    }

    const token = await getShiprocketToken()
    const baseUrl = getShiprocketBaseUrl()
    const payload = toShiprocketOrderPayload({ order, overrides })

    const resp = await axios.post(`${baseUrl}/orders/create/adhoc`, payload, {
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    const data = resp?.data || {}

    const shiprocket = {
      orderId: data?.order_id || null,
      shipmentId: data?.shipment_id || null,
      awbCode: data?.awb_code || null,
      courierCompanyId: data?.courier_company_id || null,
      courierName: data?.courier_name || null,
      status: 'created',
      raw: data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }
    

    await orderRef.set(
      {
        shiprocket,
        status: 'Processing',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return res.json({ ok: true, shiprocket })
  } catch (e) {
    console.log("========================================");
    console.error("SHIPROCKET API ERROR DETAILS:", JSON.stringify(e.response?.data || e.message, null, 2));
    console.log("========================================");
    const details = e?.details || null
    const upstreamData = e?.response?.data || null
    const upstreamStatus = e?.response?.status || null
    const msg =
      typeof upstreamData === 'string'
        ? upstreamData
        : upstreamData
          ? JSON.stringify(upstreamData)
          : e?.message || 'Unknown error'
    const status = e?.response?.status || 500
    return res
      .status(status >= 400 && status < 600 ? status : 500)
      .json({
        error: 'shiprocket_create_failed',
        message: msg,
        details,
        upstreamStatus,
        upstreamData,
      })
  }
})

// Track shipment by AWB
app.get('/shiprocket/track/:awb', requireFirebaseAuth, async (req, res) => {
  try {
    const awb = String(req.params.awb || '').trim()
    if (!awb) return res.status(400).json({ error: 'missing_awb' })

    const token = await getShiprocketToken()
    const baseUrl = getShiprocketBaseUrl()

    const resp = await axios.get(`${baseUrl}/courier/track/awb/${encodeURIComponent(awb)}`, {
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    return res.json(resp.data)
  } catch (e) {
    const msg = e?.response?.data || e?.message || 'Unknown error'
    const status = e?.response?.status || 500
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: 'shiprocket_track_failed', message: msg })
  }
})

app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT}`)
})
