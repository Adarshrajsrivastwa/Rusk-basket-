# API request fields (auto-generated from route validators)

Each route lists **param** (path), **query**, and **body** field names as used in `express-validator`.
Multipart forms use the same field names as body. Nested fields use dot notation (e.g. `items.*.productId`).

| Legend | Meaning |
|--------|--------|
| R | often required in validator chain (check `optional()` in source if unsure) |
| * | array element wildcard |

---

## /api/admin — `routes/admin.js`

### GET `/api/admin/products`

- **query:** page, limit, vendor, category, subCategory, approvalStatus, isActive, search

### POST `/api/admin/products`

- **body:** vendorId, productName, productType, productTypeValue, productTypeUnit, category, subCategory, description, skuHsn, inventory, actualPrice, regularPrice, salePrice, cashback, tax, tags

### GET `/api/admin/products/:id`

- **param:** id

### PUT `/api/admin/products/:id`

- **param:** id
- **body:** productName, productType, productTypeValue, productTypeUnit, category, subCategory, description, skuHsn, inventory, actualPrice, regularPrice, salePrice, cashback, tax, isActive, latitude, longitude, tags, skus

### GET `/api/admin/orders`

- **query:** page, limit, status, user, vendor, paymentStatus, paymentMethod, startDate, endDate, search

### GET `/api/admin/profile`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/admin/profile`

- **body:** name, companyName, legalName, website, alternatePhone, contactPerson, designation, bankName, branchName, accountNumber, ifscCode, foundedYear, registrationNumber, gstNumber, panNumber, vision, mission, streetAddress, city, state, pincode, country, latitude, longitude, emailVerified, phoneVerified, yearsInBusiness, totalEmployees, activeClients, totalLeads, mobile, email

### GET `/api/admin/tickets`

- **query:** page, limit, status, category, createdByModel, search

### GET `/api/admin/tickets/:ticketId`

- **param:** ticketId

### PATCH `/api/admin/tickets/:ticketId/status`

- **param:** ticketId
- **body:** status, adminResponse

### POST `/api/admin/tickets/:ticketId/messages`

- **param:** ticketId
- **body:** message

### GET `/api/admin/vendors`

- **query:** page, limit, search

### GET `/api/admin/vendors/wallets`

- **query:** page, limit, search, isActive

### GET `/api/admin/riders/wallets`

- **query:** page, limit, search, approvalStatus, isActive

### PUT `/api/admin/riders/:id/commission`

- **param:** id
- **body:** type, percentage, fixedAmount, subscriptionAmount, subscriptionPeriod

### GET `/api/admin/vendors/withdrawal-requests`

- **query:** page, limit, status, vendorId

### PUT `/api/admin/vendors/withdrawal-requests/:requestId/approve`

- **param:** requestId

### PUT `/api/admin/vendors/withdrawal-requests/:requestId/reject`

- **param:** requestId
- **body:** rejectionReason

### GET `/api/admin/vendors/:vendorId/orders`

- **param:** vendorId
- **query:** page, limit, status, search

### GET `/api/admin/vendors/:id`

- **param:** id

### PUT `/api/admin/vendors/:id/suspend`

- **param:** id

### PUT `/api/admin/vendors/:id/documents`

- **param:** id

### PUT `/api/admin/vendors/:id/radius`

- **param:** id
- **body:** serviceRadius

### PUT `/api/admin/vendors/:id/handling-charge`

- **param:** id
- **body:** handlingChargePercentage

### DELETE `/api/admin/vendors/:id`

- **param:** id

### GET `/api/admin/riders`

- **query:** page, limit, approvalStatus, isActive

### GET `/api/admin/riders/pending`

- **query:** page, limit

### GET `/api/admin/riders/withdrawal-requests`

- **query:** page, limit, status, riderId

### PUT `/api/admin/riders/withdrawal-requests/:requestId/approve`

- **param:** requestId

### PUT `/api/admin/riders/withdrawal-requests/:requestId/reject`

- **param:** requestId
- **body:** rejectionReason

### GET `/api/admin/riders/:id`

- **param:** id

### PUT `/api/admin/riders/:id/approve`

- **param:** id

### PUT `/api/admin/riders/:id/reject`

- **param:** id
- **body:** rejectionReason

### PUT `/api/admin/riders/:id/suspend`

- **param:** id

### GET `/api/admin/notifications`

- **query:** page, limit, isRead, type

### GET `/api/admin/notifications/unread-count`

- *(no body/query/path validators, or only middleware)*

### PATCH `/api/admin/notifications/:notificationId/read`

- **param:** notificationId

### PUT `/api/admin/notifications/:notificationId/read`

- **param:** notificationId

### PATCH `/api/admin/notifications/read-all`

- *(no body/query/path validators, or only middleware)*

### DELETE `/api/admin/notifications/:notificationId`

- **param:** notificationId

### DELETE `/api/admin/notifications`

- *(no body/query/path validators, or only middleware)*

### POST `/api/admin/fcm-token`

- **body:** token, deviceId, platform

### POST `/api/admin/send-custom-push-notification`

- **body:** title, message, targetGroup, specificIds

### POST `/api/admin/fcm-token/remove`

- **body:** token

### POST `/api/admin/test-notification`

- *(no body/query/path validators, or only middleware)*

### POST `/api/admin/add`

- **body:** name, mobile, email

### GET `/api/admin/list`

- **query:** page, limit, isActive, search

### GET `/api/admin/referral-settings`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/admin/referral-settings`

- **body:** userReferrerAmount, userRefereeAmount, riderReferrerAmount, riderRefereeAmount, isActive

### GET `/api/admin/cashback-settings`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/admin/cashback-settings`

- **body:** cashbackPercentage, minimumOrderAmount, maximumCashbackPerOrder, minimumCashbackToUse, maxCashbackUsagePercentage, maxCashbackUsageAmount, isActive

## /api/analytics — `routes/analytics.js`

### GET `/api/analytics/vendor/dashboard`

- **query:** period

### GET `/api/analytics/vendor/sales`

- **query:** period, groupBy

### GET `/api/analytics/vendor/products`

- **query:** period, limit

### GET `/api/analytics/vendor/overview`

- *(no body/query/path validators, or only middleware)*

### GET `/api/analytics/admin/dashboard`

- **query:** period

### GET `/api/analytics/admin/sales`

- **query:** period, groupBy, vendorId

### GET `/api/analytics/admin/vendors`

- **query:** period, limit

### GET `/api/analytics/admin/products`

- **query:** period, limit

### GET `/api/analytics/admin/dashboard/overview`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/analytics/vendor/product/:productId/inventory`

- **param:** productId
- **body:** addedProduct

### PUT `/api/analytics/vendor/product/:productId/stock`

- **param:** productId
- **body:** addedProduct

### GET `/api/analytics/vendor/product/:productId/inventory`

- **param:** productId

### GET `/api/analytics/admin/product/:productId/inventory`

- **param:** productId

### GET `/api/analytics/vendor/inventory`

- **query:** page, limit, stockStatus

### GET `/api/analytics/admin/inventory`

- **query:** page, limit, stockStatus

### GET `/api/analytics/vendor/products/list`

- **query:** page, limit, stockStatus, approvalStatus, search, sortBy, sortOrder

### GET `/api/analytics/vendor/riders/no-orders`

- *(no body/query/path validators, or only middleware)*

### GET `/api/analytics/vendor/product-sales-report`

- **query:** startDate, endDate

### GET `/api/analytics/admin/product-sales-report`

- **query:** startDate, endDate, vendorId

## /api/auth — `routes/auth.js`

### POST `/api/auth/login`

- **body:** mobile, role

### POST `/api/auth/verify-otp`

- **body:** mobile, otp, role

### POST `/api/auth/admin/logout`

- *(no body/query/path validators, or only middleware)*

## /api/banner — `routes/banner.js`

### GET `/api/banner/`

- **query:** page, limit, isActive

### GET `/api/banner/:id`

- *(no body/query/path validators, or only middleware)*

### POST `/api/banner/create`

- **body:** name

### DELETE `/api/banner/:id`

- *(no body/query/path validators, or only middleware)*

### PATCH `/api/banner/:id/toggle-status`

- *(no body/query/path validators, or only middleware)*

## /api/cashback — `routes/cashback.js`

### GET `/api/cashback/admin/settings`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/cashback/admin/settings`

- **body:** cashbackPercentage, minimumOrderAmount, maximumCashbackPerOrder, minimumCashbackToUse, maxCashbackUsagePercentage, maxCashbackUsageAmount, isActive

### GET `/api/cashback/admin/transactions`

- **query:** page, limit, userId

### POST `/api/cashback/admin/adjust/:userId`

- **param:** userId
- **body:** amount, description, expiresInDays

### GET `/api/cashback/admin/user-stats/:userId`

- **param:** userId

### GET `/api/cashback/user/balance`

- *(no body/query/path validators, or only middleware)*

### GET `/api/cashback/user/transactions`

- **query:** page, limit, type

### GET `/api/cashback/user/pending`

- *(no body/query/path validators, or only middleware)*

### POST `/api/cashback/user/claim`

- **body:** pendingCashbackId

### POST `/api/cashback/user/claim-all`

- *(no body/query/path validators, or only middleware)*

### POST `/api/cashback/user/calculate`

- **body:** orderTotal

## /api/category — `routes/category.js`

### POST `/api/category/create`

- **body:** name, description

### GET `/api/category/`

- *(no body/query/path validators, or only middleware)*

### GET `/api/category/nearby`

- *(no body/query/path validators, or only middleware)*

### GET `/api/category/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/category/:id`

- **body:** name, description

### DELETE `/api/category/:id`

- *(no body/query/path validators, or only middleware)*

### PATCH `/api/category/:id/toggle-status`

- *(no body/query/path validators, or only middleware)*

## /api/checkout — `routes/checkout.js`

### GET `/api/checkout/vendor/orders`

- **query:** page, limit, status

### GET `/api/checkout/vendor/order/:orderId`

- **param:** orderId

### GET `/api/checkout/vendor/order/:orderId/invoice`

- **param:** orderId

### PUT `/api/checkout/vendor/order/:orderId/status`

- **param:** orderId
- **body:** status

### PUT `/api/checkout/vendor/order/:orderId/out-for-delivery`

- **param:** orderId
- **body:** riderId, notes

### POST `/api/checkout/vendor/order/:orderId/items`

- **param:** orderId
- **body:** items, items.*.productId, items.*.quantity, items.*.sku

### GET `/api/checkout/cart`

- *(no body/query/path validators, or only middleware)*

### POST `/api/checkout/cart/add`

- **body:** productId, quantity, sku

### PUT `/api/checkout/cart/item/:itemId`

- **param:** itemId
- **body:** quantity

### PUT `/api/checkout/cart/item`

- **query:** itemId
- **body:** quantity

### DELETE `/api/checkout/cart/item/:itemId`

- **param:** itemId

### DELETE `/api/checkout/cart/item`

- **query:** itemId

### DELETE `/api/checkout/cart/clear`

- *(no body/query/path validators, or only middleware)*

### POST `/api/checkout/cart/coupon/apply`

- **body:** couponCode

### DELETE `/api/checkout/cart/coupon/remove`

- *(no body/query/path validators, or only middleware)*

### POST `/api/checkout/cart/cashback/apply`

- **body:** cashbackAmount

### DELETE `/api/checkout/cart/cashback/remove`

- *(no body/query/path validators, or only middleware)*

### POST `/api/checkout/order/create`

- **body:** shippingAddress, lat, long, paymentMethod, notes, deliveryInstruction

### GET `/api/checkout/orders`

- **query:** page, limit, status

### GET `/api/checkout/order/:orderId`

- **param:** orderId

### GET `/api/checkout/order/:orderId/invoice`

- **param:** orderId

### POST `/api/checkout/order/:orderId/cancel`

- **param:** orderId
- **body:** reason

### POST `/api/checkout/order/:orderId/reorder`

- **param:** orderId

### POST `/api/checkout/order/:orderId/confirm-cod`

- **param:** orderId

## /api/coupon — `routes/coupon.js`

### GET `/api/coupon/today-offers`

- *(no body/query/path validators, or only middleware)*

### GET `/api/coupon/available`

- **query:** cartAmount

### POST `/api/coupon/create`

- **body:** couponName, offerId, offerType, code, minAmount, maxAmount, discountAmount, discountPercentage, status, validFrom, validUntil, usageLimit

### GET `/api/coupon/`

- **query:** page, limit, status, offerType

### GET `/api/coupon/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/coupon/:id`

- **body:** couponName, offerId, offerType, code, minAmount, maxAmount, discountAmount, discountPercentage, appliedOn, categories, categories.*, prepaidMinAmount, prepaidMaxAmount, prepaidDiscountPercentage, products, products.*, offerAmount, dateRange.startDate, dateRange.endDate, timeRange.startTime, timeRange.endTime, sendNotification, status, validFrom, validUntil, usageLimit, isActive

### DELETE `/api/coupon/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/coupon/:id/toggle-status`

- *(no body/query/path validators, or only middleware)*

## /api/daily-order — `routes/dailyOrder.js`

### PUT `/api/daily-order/`

- **body:** items, items.*.productId, items.*.quantity, items.*.sku, shippingAddress.line1, shippingAddress.pinCode, shippingAddress.city, shippingAddress.state, shippingAddress.phone, shippingAddress.line2, shippingAddress.latitude, shippingAddress.longitude, daysOfWeek, daysOfWeek.*, deliveryTime, startDate, endDate, isActive, notes

### GET `/api/daily-order/`

- *(no body/query/path validators, or only middleware)*

### DELETE `/api/daily-order/`

- *(no body/query/path validators, or only middleware)*

## /api/invoice — `routes/invoice.js`

### GET `/api/invoice/:invoiceId`

- **param:** invoiceId

### PUT `/api/invoice/order/:orderNumber/update-from-order`

- **param:** orderNumber

### GET `/api/invoice/order/:orderNumber/download-pdf`

- *(no body/query/path validators, or only middleware)*

### GET `/api/invoice/order/:orderId`

- **param:** orderId

### GET `/api/invoice/user/my-invoices`

- **query:** page, limit, status

### GET `/api/invoice/vendor/my-invoices`

- **query:** page, limit, status

### GET `/api/invoice/admin/all`

- **query:** page, limit, status, vendorId, userId

### PATCH `/api/invoice/:invoiceId/status`

- **param:** invoiceId
- **body:** status

### PUT `/api/invoice/:invoiceId`

- **param:** invoiceId
- **body:** items, items.*.sku, items.*.hssn, pricing.subtotal, pricing.discount, pricing.itemCost, pricing.cgst, pricing.sgst, pricing.totalGst, pricing.handlingCharge, pricing.totalAmount, pricing.totalCashback, dueDate

### POST `/api/invoice/order/:orderNumber/generate-pdf`

- **param:** orderNumber

### GET `/api/invoice/order-statuses`

- *(no body/query/path validators, or only middleware)*

## /api/payment — `routes/payment.js`

### POST `/api/payment/initialize`

- **body:** orderId

### POST `/api/payment/verify`

- **body:** orderId, paymentData, gateway

### POST `/api/payment/rider/verify`

- **body:** orderId, paymentData, gateway

### POST `/api/payment/phonepay/callback`

- *(no body/query/path validators, or only middleware)*

### POST `/api/payment/cashfree/callback`

- *(no body/query/path validators, or only middleware)*

### POST `/api/payment/razorpay/callback`

- *(no body/query/path validators, or only middleware)*

### POST `/api/payment/retry/:orderId`

- **param:** orderId

### GET `/api/payment/gateways`

- *(no body/query/path validators, or only middleware)*

### POST `/api/payment/create-payment-link`

- **body:** amount, name, email, contact, description, callbackUrl, gateway

## /api/payment-gateway — `routes/paymentGateway.js`

### GET `/api/payment-gateway/enabled`

- *(no body/query/path validators, or only middleware)*

### GET `/api/payment-gateway/`

- **query:** enabled

### GET `/api/payment-gateway/:gatewayId`

- **param:** gatewayId

### POST `/api/payment-gateway/`

- **body:** name, displayName, isEnabled, testMode, priority, description, credentials, testCredentials

### PUT `/api/payment-gateway/:gatewayId`

- **param:** gatewayId
- **body:** displayName, isEnabled, testMode, priority, description, credentials, testCredentials

### PATCH `/api/payment-gateway/:gatewayId/toggle`

- **param:** gatewayId

### DELETE `/api/payment-gateway/:gatewayId`

- **param:** gatewayId

### POST `/api/payment-gateway/test-credentials`

- **body:** gatewayName, credentials, isTestMode

## /api/payment-request — `routes/paymentRequest.js`

### POST `/api/payment-request/send`

- **body:** requestedTo, requestedToType, amount, currency, description, paymentMethod, orderId, metadata

### GET `/api/payment-request/my-requests`

- **query:** page, limit, status

### GET `/api/payment-request/received`

- **query:** page, limit, status

### GET `/api/payment-request/:requestId`

- **param:** requestId

### POST `/api/payment-request/:requestId/approve`

- **param:** requestId

### POST `/api/payment-request/:requestId/reject`

- **param:** requestId
- **body:** rejectionReason

### POST `/api/payment-request/:requestId/cancel`

- **param:** requestId

## /api/product — `routes/product.js`

### GET `/api/product/search`

- **query:** latitude, longitude, lat, lng, search, radius, page, limit

### GET `/api/product/`

- **query:** latitude, longitude, lat, lng, radius, page, limit, category, subCategory, search

### GET `/api/product/daily-offers`

- **query:** latitude, longitude, lat, lng, radius, page, limit, category, subCategory, search, vendorId

### GET `/api/product/vendors/:vendorId/daily-offers`

- **query:** page, limit

### PUT `/api/product/daily-offers/:productId`

- **param:** productId
- **body:** offerEnabled, offerDiscountPercentage, offerStartDate, offerStartTime, offerEndDate, offerEndTime, isDailyOffer

### GET `/api/product/admin/list`

- **query:** page, limit, vendor, category, subCategory, approvalStatus, isActive, search

### GET `/api/product/pending`

- **query:** page, limit, vendor, category, subCategory, isActive, search

### GET `/api/product/all`

- **query:** page, limit, vendor, category, subCategory, approvalStatus, isActive, search

### POST `/api/product/create`

- *(no body/query/path validators, or only middleware)*

### POST `/api/product/add`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/product/update/:id`

- **body:** productName, productType, productTypeValue, productTypeUnit, category, subCategory, description, skuHsn, inventory, actualPrice, regularPrice, salePrice, cashback, tax, handlingCharge, latitude, longitude, tags

### DELETE `/api/product/vendor/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/product/approve/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/product/reject/:id`

- **body:** rejectionReason

### PUT `/api/product/admin/:id`

- **body:** productName, productType, productTypeValue, productTypeUnit, category, subCategory, description, skuHsn, inventory, actualPrice, regularPrice, salePrice, cashback, tax, handlingCharge, latitude, longitude, tags

### DELETE `/api/product/admin/:id`

- *(no body/query/path validators, or only middleware)*

### POST `/api/product/scan-qr`

- **body:** productId, sku

### GET `/api/product/:id`

- *(no body/query/path validators, or only middleware)*

## /api/queue — `routes/queue.js`

### GET `/api/queue/stats`

- *(no body/query/path validators, or only middleware)*

## /api/rider — `routes/rider.js`

### POST `/api/rider/login`

- **body:** mobileNumber, referralCode

### POST `/api/rider/verify-login-otp`

- **body:** mobileNumber, otp, fcmToken, deviceId, platform

### GET `/api/rider/profile`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/rider/profile`

- **body:** fullName, fathersName, mothersName, dateOfBirth, whatsappNumber, bloodGroup, city, currentAddressLine1, currentAddressLine2, pinCode, latitude, longitude, language, emergencyContactPersonName, emergencyContactPersonRelation, emergencyContactPersonNumber, emergencyContactNumber, workDetails, aadharId, accountNumber, ifsc, bankName, branchName, accountHolderName

### GET `/api/rider/notifications`

- *(no body/query/path validators, or only middleware)*

### GET `/api/rider/notifications/unread-count`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/rider/notifications/:id/read`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/rider/notifications/read-all`

- *(no body/query/path validators, or only middleware)*

### DELETE `/api/rider/notifications/:id`

- *(no body/query/path validators, or only middleware)*

### POST `/api/rider/fcm-token`

- **body:** token, deviceId, platform

### POST `/api/rider/fcm-token/remove`

- **body:** token

### POST `/api/rider/fcm-token/test`

- *(no body/query/path validators, or only middleware)*

### GET `/api/rider/referral`

- *(no body/query/path validators, or only middleware)*

### POST `/api/rider/referral/apply`

- **body:** referralCode

### GET `/api/rider/:riderId/orders/delivered`

- **param:** riderId
- **query:** page, limit

### GET `/api/rider/:riderId/orders/current`

- **param:** riderId

### GET `/api/rider/`

- *(no body/query/path validators, or only middleware)*

### GET `/api/rider/pending`

- *(no body/query/path validators, or only middleware)*

### GET `/api/rider/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/rider/:id/approve`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/rider/:id/reject`

- **body:** rejectionReason

### PUT `/api/rider/:id/suspend`

- *(no body/query/path validators, or only middleware)*

### GET `/api/rider/orders/available`

- **query:** page, limit

### POST `/api/rider/orders/:orderId/accept`

- **param:** orderId

### POST `/api/rider/orders/:orderId/reject`

- **param:** orderId
- **body:** reason

### POST `/api/rider/orders/:orderId/upload-delivery-image`

- **param:** orderId

### POST `/api/rider/orders/:orderId/delivered-image`

- **param:** orderId

### POST `/api/rider/orders/:orderId/delivered`

- **param:** orderId

### GET `/api/rider/orders/my-orders`

- **query:** page, limit, status

### GET `/api/rider/orders/delivered`

- **query:** page, limit

### GET `/api/rider/orders/current`

- *(no body/query/path validators, or only middleware)*

### GET `/api/rider/websocket/status`

- *(no body/query/path validators, or only middleware)*

### POST `/api/rider/logout`

- *(no body/query/path validators, or only middleware)*

### POST `/api/rider/tickets`

- **body:** complaint, category, orderId

### GET `/api/rider/tickets`

- **query:** page, limit, status, category

### GET `/api/rider/tickets/:ticketId`

- **param:** ticketId

### POST `/api/rider/tickets/:ticketId/messages`

- **param:** ticketId
- **body:** message

### POST `/api/rider/order/:orderId/mark-payment-cash`

- **param:** orderId

### POST `/api/rider/wallet/earning/send`

- **body:** amount, description

### GET `/api/rider/wallet/earning/withdrawal-requests`

- **query:** page, limit, status

### POST `/api/rider/wallet/due/request`

- **body:** amount, description

## /api/rider-job-application — `routes/riderJobApplication.js`

### POST `/api/rider-job-application/apply`

- **body:** jobPostId

### GET `/api/rider-job-application/my-applications`

- *(no body/query/path validators, or only middleware)*

### POST `/api/rider-job-application/:applicationId/confirm`

- *(no body/query/path validators, or only middleware)*

### GET `/api/rider-job-application/job/:jobPostId`

- *(no body/query/path validators, or only middleware)*

### GET `/api/rider-job-application/job/:jobPostId/assigned`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/rider-job-application/:applicationId/review`

- **body:** status, rejectionReason

### PUT `/api/rider-job-application/:applicationId/assign`

- **body:** assignmentNotes

### GET `/api/rider-job-application/:applicationId`

- *(no body/query/path validators, or only middleware)*

## /api/rider-job-post — `routes/riderJobPost.js`

### POST `/api/rider-job-post/create`

- **body:** jobTitle, joiningBonus, onboardingFee, locationLine1, locationPinCode, locationLine2, locationCity, locationState, locationLatitude, locationLongitude

### POST `/api/rider-job-post/admin/create`

- **body:** jobTitle, joiningBonus, onboardingFee, vendor, locationLine1, locationPinCode, locationLine2, locationCity, locationState, locationLatitude, locationLongitude

### GET `/api/rider-job-post/`

- **query:** page, limit, isActive, city, state, pinCode, search

### GET `/api/rider-job-post/admin/all`

- **query:** vendor, page, limit, isActive

### GET `/api/rider-job-post/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/rider-job-post/:id`

- **body:** jobTitle, joiningBonus, onboardingFee, locationLine1, locationPinCode, locationLine2, locationCity, locationState, locationLatitude, locationLongitude

### PUT `/api/rider-job-post/admin/:id`

- **body:** jobTitle, joiningBonus, onboardingFee, vendor, locationLine1, locationPinCode, locationLine2, locationCity, locationState, locationLatitude, locationLongitude

### DELETE `/api/rider-job-post/:id`

- *(no body/query/path validators, or only middleware)*

### DELETE `/api/rider-job-post/admin/:id`

- *(no body/query/path validators, or only middleware)*

### PATCH `/api/rider-job-post/:id/toggle-status`

- *(no body/query/path validators, or only middleware)*

## /api/subcategory — `routes/subCategory.js`

### POST `/api/subcategory/create`

- **body:** name, description, category

### GET `/api/subcategory/`

- *(no body/query/path validators, or only middleware)*

### GET `/api/subcategory/by-location`

- **query:** latitude, longitude, lat, lng, radius, category

### GET `/api/subcategory/by-category/:categoryId`

- *(no body/query/path validators, or only middleware)*

### GET `/api/subcategory/nearby`

- *(no body/query/path validators, or only middleware)*

### GET `/api/subcategory/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/subcategory/:id`

- **body:** name, description, category, isActive

### DELETE `/api/subcategory/:id`

- *(no body/query/path validators, or only middleware)*

### PATCH `/api/subcategory/:id/toggle-status`

- *(no body/query/path validators, or only middleware)*

## /api/suggestion — `routes/suggestion.js`

### POST `/api/suggestion/create`

- **body:** text

### GET `/api/suggestion/`

- **query:** page, limit

### GET `/api/suggestion/:id`

- **param:** id

### PUT `/api/suggestion/:id`

- **param:** id
- **body:** text

### DELETE `/api/suggestion/:id`

- **param:** id

## /api/ticket — `routes/ticket.js`

### GET `/api/ticket/`

- **query:** page, limit, status, category, createdByModel, search

### GET `/api/ticket/:ticketId`

- **param:** ticketId

### PATCH `/api/ticket/:ticketId/status`

- **param:** ticketId
- **body:** status, adminResponse

### POST `/api/ticket/:ticketId/messages`

- **param:** ticketId
- **body:** message

## /api/user — `routes/user.js`

### POST `/api/user/login`

- **body:** contactNumber, referralCode

### POST `/api/user/verify-login-otp`

- **body:** contactNumber, otp, fcmToken, deviceId, platform

### GET `/api/user/profile`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/user/profile`

- **body:** userName, email, gender, dateOfBirth, addressLine1, addressLine2, pinCode, latitude, longitude, defaultAddressLine1, defaultAddressLine2, defaultAddressPinCode, defaultAddressLabel, defaultAddressLatitude, defaultAddressLongitude

### GET `/api/user/cashback`

- *(no body/query/path validators, or only middleware)*

### POST `/api/user/addresses`

- **body:** line1, line2, pinCode, label, latitude, longitude, type, isDefault

### GET `/api/user/addresses`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/user/addresses/:addressId`

- **param:** addressId
- **body:** line1, line2, pinCode, label, latitude, longitude, type, isDefault

### DELETE `/api/user/addresses/:addressId`

- **param:** addressId

### PATCH `/api/user/addresses/:addressId/set-default`

- **param:** addressId

### POST `/api/user/logout`

- *(no body/query/path validators, or only middleware)*

### GET `/api/user/products`

- **query:** page, subCategory, category, search, latitude, longitude, lat, lng, radius, tag

### POST `/api/user/tickets`

- **body:** complaint, category, orderId

### GET `/api/user/tickets`

- **query:** page, limit, status, category

### GET `/api/user/tickets/:ticketId`

- **param:** ticketId

### PATCH `/api/user/tickets/:ticketId`

- **param:** ticketId
- **body:** complaint, category, orderId

### POST `/api/user/tickets/:ticketId/messages`

- **param:** ticketId
- **body:** message

### GET `/api/user/referral`

- *(no body/query/path validators, or only middleware)*

### POST `/api/user/referral/apply`

- **body:** referralCode

## /api/notifications — `routes/userNotification.js`

### GET `/api/notifications/`

- *(no body/query/path validators, or only middleware)*

### GET `/api/notifications/unread-count`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/notifications/:id/read`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/notifications/read-all`

- *(no body/query/path validators, or only middleware)*

### DELETE `/api/notifications/:id`

- *(no body/query/path validators, or only middleware)*

### POST `/api/notifications/fcm-token`

- **body:** token, deviceId, platform

### POST `/api/notifications/fcm-token/remove`

- **body:** token

### POST `/api/notifications/test`

- *(no body/query/path validators, or only middleware)*

## /api/vendor — `routes/vendor.js`

### POST `/api/vendor/send-otp`

- **body:** contactNumber

### POST `/api/vendor/verify-otp`

- **body:** contactNumber, otp

### POST `/api/vendor/create`

- **body:** vendorName, contactNumber, email, gender, dateOfBirth, storeName, storeAddressLine1, pinCode, city, state, ifsc, accountNumber, bankName, bank_name, serviceRadius, handlingChargePercentage

### GET `/api/vendor/`

- **query:** page, limit, search

### GET `/api/vendor/orders`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/vendor/orders/:id/status`

- **body:** status, notes

### PUT `/api/vendor/orders/:orderId/assign-rider`

- **body:** riderId, assignmentNotes, updateStatus

### GET `/api/vendor/orders/:id`

- *(no body/query/path validators, or only middleware)*

### POST `/api/vendor/order/:orderId/items`

- **body:** items, items.*.productId, items.*.quantity, items.*.sku

### GET `/api/vendor/products`

- *(no body/query/path validators, or only middleware)*

### GET `/api/vendor/my-job-posts`

- **query:** page, limit, isActive, search, city, state, pinCode

### POST `/api/vendor/job-posts/create`

- **body:** jobTitle, joiningBonus, onboardingFee, locationLine1, locationPinCode, locationLine2, locationCity, locationState, locationLatitude, locationLongitude

### GET `/api/vendor/job-posts`

- *(no body/query/path validators, or only middleware)*

### GET `/api/vendor/job-posts/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/vendor/job-posts/:id`

- **body:** jobTitle, joiningBonus, onboardingFee, locationLine1, locationPinCode, locationLine2, locationCity, locationState, locationLatitude, locationLongitude

### DELETE `/api/vendor/job-posts/:id`

- *(no body/query/path validators, or only middleware)*

### PATCH `/api/vendor/job-posts/:id/toggle-status`

- *(no body/query/path validators, or only middleware)*

### GET `/api/vendor/job-applications`

- *(no body/query/path validators, or only middleware)*

### GET `/api/vendor/job-posts/:jobPostId/applications`

- *(no body/query/path validators, or only middleware)*

### GET `/api/vendor/job-applications/:applicationId`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/vendor/job-applications/:applicationId/review`

- **body:** status, rejectionReason

### PUT `/api/vendor/job-applications/:applicationId/assign`

- **body:** assignmentNotes

### GET `/api/vendor/job-posts/:jobPostId/assigned-riders`

- *(no body/query/path validators, or only middleware)*

### GET `/api/vendor/riders/due-amounts`

- **query:** page, limit, isActive, approvalStatus

### PUT `/api/vendor/riders/:riderId/due-amount`

- **param:** riderId
- **body:** dueAmount, orderId, description

### GET `/api/vendor/inventory`

- **query:** page, limit, search

### GET `/api/vendor/inventory/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/vendor/inventory/:id`

- **body:** inventory, action, skus, skus.*.sku, skus.*.inventory

### GET `/api/vendor/profile`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/vendor/profile`

- **body:** vendorName, altContactNumber, email, gender, dateOfBirth, storeName, storeAddressLine1, storeAddressLine2, pinCode, latitude, longitude, ifsc, accountNumber, bankName, bank_name, serviceRadius, handlingChargePercentage, fssaiNumber, deliveryChargePerKm, contactNumber

### GET `/api/vendor/notifications`

- **query:** page, limit, isRead, type

### GET `/api/vendor/notifications/unread-count`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/vendor/notifications/:notificationId/read`

- **param:** notificationId

### PUT `/api/vendor/notifications/read-all`

- *(no body/query/path validators, or only middleware)*

### DELETE `/api/vendor/notifications/:notificationId`

- **param:** notificationId

### DELETE `/api/vendor/notifications`

- *(no body/query/path validators, or only middleware)*

### POST `/api/vendor/tickets`

- **body:** complaint, category, orderId

### GET `/api/vendor/tickets`

- **query:** page, limit, status, category

### GET `/api/vendor/tickets/:ticketId`

- **param:** ticketId

### POST `/api/vendor/tickets/:ticketId/messages`

- **param:** ticketId
- **body:** message

### GET `/api/vendor/:id/dashboard`

- **param:** id

### GET `/api/vendor/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/vendor/:id`

- **body:** vendorName, altContactNumber, email, gender, dateOfBirth, storeName, storeAddressLine1, storeAddressLine2, pinCode, city, state, latitude, longitude, ifsc, accountNumber, bankName, bank_name, serviceRadius, handlingChargePercentage, fssaiNumber, deliveryChargePerKm

### PUT `/api/vendor/:id/permissions`

- **body:** permissions

### PUT `/api/vendor/:id/documents`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/vendor/:id/radius`

- **body:** serviceRadius

### PUT `/api/vendor/:id/handling-charge`

- **body:** handlingChargePercentage

### PUT `/api/vendor/:id/suspend`

- *(no body/query/path validators, or only middleware)*

### GET `/api/vendor/:id/commission`

- **param:** id

### PUT `/api/vendor/:id/commission`

- **param:** id
- **body:** type, percentage, fixedAmount, subscriptionAmount, subscriptionPeriod

### DELETE `/api/vendor/:id`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/vendor/products/:productId/offer`

- **body:** offerEnabled, offerDiscountPercentage, offerStartDate, offerStartTime, offerEndDate, offerEndTime, isDailyOffer

### GET `/api/vendor/products/offers`

- **query:** page, limit, status

### GET `/api/vendor/products/:productId/offer`

- *(no body/query/path validators, or only middleware)*

### PUT `/api/vendor/daily-offers/:productId`

- **param:** productId
- **body:** offerEnabled, offerDiscountPercentage, offerStartDate, offerStartTime, offerEndDate, offerEndTime, isDailyOffer

### POST `/api/vendor/wallet/earning/send`

- **body:** amount, description

### GET `/api/vendor/wallet/earning/withdrawal-requests`

- **query:** page, limit, status

### POST `/api/vendor/logout`

- *(no body/query/path validators, or only middleware)*

## /api/wallet — `routes/wallet.js`

### GET `/api/wallet/`

- *(no body/query/path validators, or only middleware)*

### GET `/api/wallet/transactions`

- **query:** page, limit

### POST `/api/wallet/reset/:userId`

- **param:** userId
- **body:** reason

## /api/wishlist — `routes/wishlist.js`

### GET `/api/wishlist/`

- *(no body/query/path validators, or only middleware)*

### POST `/api/wishlist/add`

- **body:** productId

### DELETE `/api/wishlist/remove/:productId`

- **param:** productId

### DELETE `/api/wishlist/clear`

- *(no body/query/path validators, or only middleware)*

### GET `/api/wishlist/check/:productId`

- **param:** productId

---

## Product duplicate mount

Also mounted at **/api/products/** with the same paths as **/api/product/**.

*Generated by scripts/build-api-fields-md.js — verify critical routes in source files.*
