# Razorpay Payment Link Signature Verification - Debug Guide

## ✅ Fixed Code Implementation

The signature verification has been updated with:
1. ✅ `.trim()` on all values (removes extra spaces/newlines)
2. ✅ Correct format: `payment_link_id|payment_id` (NOT `order_id|payment_id`)
3. ✅ Proper secret key handling
4. ✅ Debug logging for troubleshooting

---

## 🔍 How to Debug "Invalid payment signature" Error

### Step 1: Check Your Request Body

Make sure you're sending:
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

### Step 2: Check Server Logs

After making the request, check your server logs. You should see:

```
[INFO] Verifying Razorpay Payment Link flow
[INFO] Razorpay signature verification {
  flow: 'Payment Link',
  text: 'plink_SFkhl9Mr9hFpuo|pay_SFkizdw1LOxATo',
  generatedSignature: '7e1fdc6332e94d50f92dea5921b879d37b0e22b113484d77cde452f398c0225d',
  receivedSignature: '7e1fdc6332e94d50f92dea5921b879d37b0e22b113484d77cde452f398c0225d',
  match: true
}
```

### Step 3: Compare Generated vs Received

If `match: false`, check:
- ✅ Is `text` correct? Should be `payment_link_id|payment_id`
- ✅ Are there any extra spaces in the values?
- ✅ Is the secret key correct?

---

## 🧪 Manual Signature Test (Node.js)

Use this code to test signature generation manually:

```javascript
const crypto = require('crypto');

function testSignature() {
  // Your values from Razorpay callback
  const paymentLinkId = 'plink_SFkhl9Mr9hFpuo';
  const paymentId = 'pay_SFkizdw1LOxATo';
  const receivedSignature = '7e1fdc6332e94d50f92dea5921b879d37b0e22b113484d77cde452f398c0225d';
  const secretKey = 'YOUR_RAZORPAY_SECRET_KEY'; // From Razorpay dashboard

  // Generate signature
  const text = `${paymentLinkId.trim()}|${paymentId.trim()}`;
  const generatedSignature = crypto
    .createHmac('sha256', secretKey.trim())
    .update(text)
    .digest('hex');

  console.log('Text used:', text);
  console.log('Generated:', generatedSignature);
  console.log('Received :', receivedSignature);
  console.log('Match:', generatedSignature === receivedSignature);
}

testSignature();
```

---

## ✅ Checklist Before Testing

- [ ] `razorpay_payment_link_id` starts with `plink_`
- [ ] `razorpay_payment_id` starts with `pay_`
- [ ] `razorpay_signature` is a 64-character hex string
- [ ] Secret key is from Razorpay dashboard (Settings → API Keys)
- [ ] Secret key is NOT the Key ID (Key ID starts with `rzp_test_` or `rzp_live_`)
- [ ] No extra spaces in any values
- [ ] Using pipe `|` not comma `,`
- [ ] Format is `payment_link_id|payment_id` (NOT `order_id|payment_id`)

---

## 🔴 Common Mistakes

### ❌ Mistake 1: Using Order ID instead of Payment Link ID
```javascript
// WRONG
const text = `${orderId}|${paymentId}`;

// CORRECT
const text = `${paymentLinkId}|${paymentId}`;
```

### ❌ Mistake 2: Using Key ID instead of Secret Key
```javascript
// WRONG
const secretKey = 'rzp_test_xxxxxxxxx'; // This is Key ID

// CORRECT
const secretKey = 'xxxxxxxxxxxxxxxxxxxx'; // This is Secret Key (no prefix)
```

### ❌ Mistake 3: Not trimming values
```javascript
// WRONG
const text = `${paymentLinkId}|${paymentId}`;

// CORRECT
const text = `${paymentLinkId.trim()}|${paymentId.trim()}`;
```

### ❌ Mistake 4: Using comma instead of pipe
```javascript
// WRONG
const text = `${paymentLinkId},${paymentId}`;

// CORRECT
const text = `${paymentLinkId}|${paymentId}`;
```

---

## 🛠️ Backend Code (Current Implementation)

The backend now:
1. ✅ Trims all input values
2. ✅ Uses correct format: `payment_link_id|payment_id`
3. ✅ Validates secret key exists
4. ✅ Logs detailed debug information
5. ✅ Handles both Payment Link and Orders API flows

---

## 📋 Where to Find Razorpay Credentials

1. Go to Razorpay Dashboard
2. Settings → API Keys
3. You'll see:
   - **Key ID**: `rzp_test_xxxxxxxxx` (for test) or `rzp_live_xxxxxxxxx` (for live)
   - **Key Secret**: Long string without prefix (this is what you need!)

---

## 🎯 Test with Postman

### Request:
```
POST https://api.rushbaskets.com/api/payment/verify
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

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

### Expected Response (Success):
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

### Expected Response (Error):
```json
{
  "success": false,
  "error": "Payment verification failed: Invalid payment signature"
}
```

Check server logs for detailed debug information!

---

## 🔐 Webhook Verification (Recommended)

For production, use Razorpay webhooks instead of manual verification:

1. Configure webhook URL in Razorpay Dashboard
2. Webhook URL: `https://api.rushbaskets.com/api/payment/razorpay/callback`
3. Select event: `payment_link.paid`
4. Razorpay will automatically send webhook on payment success

This is more reliable than manual verification!
