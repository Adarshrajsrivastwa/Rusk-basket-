# Payment Verification API Documentation

## Endpoint: `POST /api/payment/verify`

### Headers
```
Authorization: Bearer <token>
Content-Type: application/json
```

---

## ✅ Razorpay Payment Link Flow

**Use Case:** When using `/api/payment/create-payment-link` endpoint

### Request Body:
```json
{
  "orderId": "698f5746af57538a8ee68d6d",
  "gateway": "razorpay",
  "paymentData": {
    "razorpay_payment_id": "pay_SFkizdw1LOxATo",
    "razorpay_payment_link_id": "plink_SFkhl9Mr9hFpuo",
    "razorpay_signature": "7e1fdc6332e94d50f92dea5921b879d37b0e22b113484d77cde452f398c0225d"
  }
}
```

### Field Details:
- `razorpay_payment_id`: Always starts with `pay_` (Payment ID from Razorpay)
- `razorpay_payment_link_id`: Always starts with `plink_` (Payment Link ID)
- `razorpay_signature`: HMAC SHA256 signature
- **Signature Formula:** `HMAC_SHA256(razorpay_payment_link_id|razorpay_payment_id, secret_key)`

---

## ✅ Razorpay Orders API Flow

**Use Case:** When using `/api/payment/initialize` endpoint

### Request Body:
```json
{
  "orderId": "698f5746af57538a8ee68d6d",
  "gateway": "razorpay",
  "paymentData": {
    "razorpay_order_id": "order_ABC123XYZ",
    "razorpay_payment_id": "pay_XYZ789ABC",
    "razorpay_signature": "signature_hash_here"
  }
}
```

### Field Details:
- `razorpay_order_id`: Always starts with `order_` (Order ID from Razorpay)
- `razorpay_payment_id`: Always starts with `pay_` (Payment ID from Razorpay)
- `razorpay_signature`: HMAC SHA256 signature
- **Signature Formula:** `HMAC_SHA256(razorpay_order_id|razorpay_payment_id, secret_key)`

---

## ✅ PhonePe Flow

### Request Body:
```json
{
  "orderId": "698f5746af57538a8ee68d6d",
  "gateway": "phonepay",
  "paymentData": {
    "merchantTransactionId": "TXN1234567890ABCDEF"
  }
}
```

---

## ✅ Cashfree Flow

### Request Body:
```json
{
  "orderId": "698f5746af57538a8ee68d6d",
  "gateway": "cashfree",
  "paymentData": {
    "orderId": "ORDER_1234567890_ABCDEF",
    "paymentSessionId": "session_xyz123"
  }
}
```

---

## ✅ Shopify Flow

### Request Body:
```json
{
  "orderId": "698f5746af57538a8ee68d6d",
  "gateway": "shopify",
  "paymentData": {
    "checkoutId": "checkout_id_here",
    "orderId": "shopify_order_id"
  }
}
```

---

## Success Response

```json
{
  "success": true,
  "message": "Payment verified successfully",
  "data": {
    "orderId": "698f5746af57538a8ee68d6d",
    "orderNumber": "ORD-12345",
    "paymentStatus": "completed",
    "transactionId": "pay_SFkizdw1LOxATo",
    "paymentMethod": "razorpay",
    "paidAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Error Response

```json
{
  "success": false,
  "error": "Payment verification failed: Invalid payment signature"
}
```

---

## 🔐 Backend Signature Verification (Razorpay)

### Payment Link Flow:
```javascript
const crypto = require("crypto");

const text = `${razorpay_payment_link_id}|${razorpay_payment_id}`;
const generatedSignature = crypto
  .createHmac("sha256", razorpayKeySecret)
  .update(text)
  .digest("hex");

if (generatedSignature === razorpay_signature) {
  // ✅ Payment verified
}
```

### Orders API Flow:
```javascript
const text = `${razorpay_order_id}|${razorpay_payment_id}`;
const generatedSignature = crypto
  .createHmac("sha256", razorpayKeySecret)
  .update(text)
  .digest("hex");

if (generatedSignature === razorpay_signature) {
  // ✅ Payment verified
}
```

---

## 📋 Comparison Table

| Field | Orders API | Payment Link |
|-------|------------|--------------|
| `razorpay_order_id` (order_...) | ✅ Required | ❌ Not used |
| `razorpay_payment_link_id` (plink_...) | ❌ Not used | ✅ Required |
| `razorpay_payment_id` (pay_...) | ✅ Required | ✅ Required |
| `razorpay_signature` | ✅ Required | ✅ Required |
| Signature Formula | `order_id\|payment_id` | `payment_link_id\|payment_id` |

---

## 🎯 When to Use Which Flow?

### Use Payment Link Flow (`/create-payment-link`) when:
- ✅ Simple payment collection
- ✅ No need for order tracking in Razorpay
- ✅ Quick payment links
- ✅ Flutter/WebView integration

### Use Orders API Flow (`/initialize`) when:
- ✅ Need refunds
- ✅ Order tracking in Razorpay dashboard
- ✅ Better scalability
- ✅ Advanced payment features

---

## ⚠️ Important Notes

1. **orderId** must be a valid MongoDB ObjectId
2. **gateway** must be one of: `"razorpay"`, `"phonepay"`, `"cashfree"`, `"shopify"`
3. **Authentication token** is required (protected route)
4. Payment Link flow and Orders API flow have **different signature verification methods**
5. Backend automatically detects which flow is being used based on the fields present
