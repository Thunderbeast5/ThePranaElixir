import 'dotenv/config'
import process from 'node:process'
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import admin from 'firebase-admin'

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
  const pincodeRaw = String(shippingAddress.postalCode || '').trim()

  const phoneRaw = String(overrides?.phone || shippingAddress.phone || order?.customerPhone || '').trim()
  const state = String(overrides?.state || order?.shippingAddress?.state || '').trim()
  const country = String(overrides?.country || order?.shippingAddress?.country || 'India').trim()

  const pincode = pincodeRaw.replace(/\D/g, '')
  let phone = phoneRaw.replace(/\D/g, '')
  if (phone.length > 10) phone = phone.slice(-10)

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

  if (country.toLowerCase() === 'india' && pincode.length !== 6) {
    const err = new Error('Invalid pincode for Shiprocket (must be 6 digits)')
    err.details = { pincode: pincodeRaw }
    throw err
  }

  if (phone.length !== 10) {
    const err = new Error('Invalid phone for Shiprocket (must be 10 digits)')
    err.details = { phone: phoneRaw }
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
    const status = e?.response?.status || (details ? 400 : 500)
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
