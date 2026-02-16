# API Response: GET /api/invoice/order/{orderId}

## Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "code": "INV000001",
      "invoiceNumber": "RUSH-INV-2024-001",
      "order": "507f191e810c19729de860ea",
      "orderNumber": "ORD-2024-001234",
      "user": {
        "_id": "507f1f77bcf86cd799439012",
        "userName": "John Doe",
        "contactNumber": "9876543210",
        "email": "john.doe@example.com",
        "shippingAddress": {
          "addressLine1": "123 Main Street",
          "addressLine2": "Apartment 4B",
          "city": "Mumbai",
          "state": "Maharashtra",
          "pinCode": "400001"
        }
      },
      "vendor": {
        "_id": "507f1f77bcf86cd799439013",
        "vendorName": "ABC Store",
        "storeName": "ABC Supermarket",
        "contactNumber": "9876543211",
        "email": "vendor@abcstore.com",
        "storeAddress": {
          "addressLine1": "456 Market Street",
          "addressLine2": "Floor 2",
          "city": "Mumbai",
          "state": "Maharashtra",
          "pinCode": "400002"
        }
      },
      "date": "2024-01-15T10:30:00.000Z",
      "dueDate": "2024-02-14T10:30:00.000Z",
      "amount": 1155.00,
      "payment": {
        "method": "cod",
        "status": "pending"
      },
      "status": "pending",
      "items": [
        {
          "product": {
            "_id": "507f1f77bcf86cd799439014",
            "productName": "Premium Rice 5kg",
            "description": "High quality basmati rice",
            "thumbnail": "https://example.com/images/rice.jpg",
            "skuHsn": "HSN1001",
            "skus": [
              {
                "sku": "RICE-5KG-001",
                "price": 500,
                "stock": 100
              }
            ]
          },
          "productName": "Premium Rice 5kg",
          "description": "High quality basmati rice",
          "quantity": 2,
          "unitPrice": 500.00,
          "totalPrice": 1000.00,
          "sku": "RICE-5KG-001",
          "hssn": "HSN1001"
        },
        {
          "product": {
            "_id": "507f1f77bcf86cd799439015",
            "productName": "Wheat Flour 2kg",
            "description": "Organic wheat flour",
            "thumbnail": "https://example.com/images/flour.jpg",
            "skuHsn": "HSN1002",
            "skus": [
              {
                "sku": "FLOUR-2KG-001",
                "price": 150,
                "stock": 50
              }
            ]
          },
          "productName": "Wheat Flour 2kg",
          "description": "Organic wheat flour",
          "quantity": 1,
          "unitPrice": 150.00,
          "totalPrice": 150.00,
          "sku": "FLOUR-2KG-001",
          "hssn": "HSN1002"
        }
      ],
      "pricing": {
        "subtotal": 1000.00,
        "discount": 100.00,
        "itemCost": 1000.00,
        "tax": 180.00,
        "cgst": 90.00,
        "sgst": 90.00,
        "totalGst": 180.00,
        "handlingCharge": 50.00,
        "deliveryCharges": 25.00,
        "totalAmount": 1155.00,
        "totalCashback": 50.00
      },
      "order": {
        "_id": "507f191e810c19729de860ea",
        "orderNumber": "ORD-2024-001234",
        "status": "confirmed",
        "items": [
          {
            "productName": "Premium Rice 5kg",
            "quantity": 2,
            "totalPrice": 1000.00
          },
          {
            "productName": "Wheat Flour 2kg",
            "quantity": 1,
            "totalPrice": 150.00
          }
        ],
        "totalAmount": 1155.00
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "_id": "507f1f77bcf86cd799439016",
      "code": "INV000002",
      "invoiceNumber": "RUSH-INV-2024-002",
      "order": "507f191e810c19729de860ea",
      "orderNumber": "ORD-2024-001234",
      "user": {
        "_id": "507f1f77bcf86cd799439012",
        "userName": "John Doe",
        "contactNumber": "9876543210",
        "email": "john.doe@example.com",
        "shippingAddress": {
          "addressLine1": "123 Main Street",
          "addressLine2": "Apartment 4B",
          "city": "Mumbai",
          "state": "Maharashtra",
          "pinCode": "400001"
        }
      },
      "vendor": {
        "_id": "507f1f77bcf86cd799439017",
        "vendorName": "XYZ Grocery",
        "storeName": "XYZ Fresh Mart",
        "contactNumber": "9876543212",
        "email": "vendor@xyzstore.com",
        "storeAddress": {
          "addressLine1": "789 Shopping Mall",
          "addressLine2": "Shop 15",
          "city": "Mumbai",
          "state": "Maharashtra",
          "pinCode": "400003"
        }
      },
      "date": "2024-01-15T10:30:00.000Z",
      "dueDate": "2024-02-14T10:30:00.000Z",
      "amount": 550.00,
      "payment": {
        "method": "prepaid",
        "status": "completed"
      },
      "status": "paid",
      "items": [
        {
          "product": {
            "_id": "507f1f77bcf86cd799439018",
            "productName": "Cooking Oil 1L",
            "description": "Refined sunflower oil",
            "thumbnail": "https://example.com/images/oil.jpg",
            "skuHsn": "HSN1003",
            "skus": [
              {
                "sku": "OIL-1L-001",
                "price": 200,
                "stock": 75
              }
            ]
          },
          "productName": "Cooking Oil 1L",
          "description": "Refined sunflower oil",
          "quantity": 2,
          "unitPrice": 200.00,
          "totalPrice": 400.00,
          "sku": "OIL-1L-001",
          "hssn": "HSN1003"
        }
      ],
      "pricing": {
        "subtotal": 400.00,
        "discount": 40.00,
        "itemCost": 400.00,
        "tax": 72.00,
        "cgst": 36.00,
        "sgst": 36.00,
        "totalGst": 72.00,
        "handlingCharge": 20.00,
        "deliveryCharges": 15.00,
        "totalAmount": 467.00,
        "totalCashback": 20.00
      },
      "order": {
        "_id": "507f191e810c19729de860ea",
        "orderNumber": "ORD-2024-001234",
        "status": "confirmed",
        "items": [
          {
            "productName": "Cooking Oil 1L",
            "quantity": 2,
            "totalPrice": 400.00
          }
        ],
        "totalAmount": 467.00
      },
      "createdAt": "2024-01-15T10:30:05.000Z",
      "updatedAt": "2024-01-15T10:30:05.000Z"
    }
  ]
}
```

## Error Response (500 Internal Server Error)

```json
{
  "success": false,
  "error": "Failed to fetch invoices"
}
```

## Error Response (400 Bad Request - Invalid Order ID)

```json
{
  "success": false,
  "errors": [
    {
      "msg": "Invalid order ID",
      "param": "orderId",
      "location": "params"
    }
  ]
}
```

## Field Descriptions

### Root Level
- `success` (boolean): Request success status
- `data` (array): Array of invoice objects

### Invoice Object
- `_id` (string): MongoDB ObjectId of the invoice
- `code` (string): Human-readable invoice code (e.g., "INV000001")
- `invoiceNumber` (string): Unique invoice number (e.g., "RUSH-INV-2024-001")
- `order` (string): MongoDB ObjectId of the order
- `orderNumber` (string): Order number
- `user` (object): User details
  - `_id` (string): User MongoDB ObjectId
  - `userName` (string): User's name
  - `contactNumber` (string): User's contact number
  - `email` (string): User's email
  - `shippingAddress` (object): Shipping address
    - `addressLine1` (string): First address line
    - `addressLine2` (string): Second address line (optional)
    - `city` (string): City name
    - `state` (string): State name
    - `pinCode` (string): PIN code
- `vendor` (object): Vendor details
  - `_id` (string): Vendor MongoDB ObjectId
  - `vendorName` (string): Vendor's name
  - `storeName` (string): Store name
  - `contactNumber` (string): Vendor's contact number
  - `email` (string): Vendor's email
  - `storeAddress` (object): Store address (same structure as shippingAddress)
- `date` (string): Invoice date (ISO 8601 format)
- `dueDate` (string): Invoice due date (ISO 8601 format, typically 30 days from invoice date)
- `amount` (number): Total invoice amount
- `payment` (object): Payment information
  - `method` (string): Payment method ("cod", "prepaid", "wallet", "upi", "card")
  - `status` (string): Payment status ("pending", "processing", "completed", "failed", "refunded")
- `status` (string): Invoice status ("pending", "paid", "cancelled", "refunded")
- `items` (array): Array of invoice items
  - `product` (object): Product details
    - `_id` (string): Product MongoDB ObjectId
    - `productName` (string): Product name
    - `description` (string): Product description
    - `thumbnail` (string): Product image URL
    - `skuHsn` (string): HSN code
    - `skus` (array): Array of SKU objects
  - `productName` (string): Product name
  - `description` (string): Product description
  - `quantity` (number): Item quantity
  - `unitPrice` (number): Price per unit
  - `totalPrice` (number): Total price for this item
  - `sku` (string): SKU code
  - `hssn` (string): HSN code
- `pricing` (object): Pricing breakdown
  - `subtotal` (number): Subtotal before discounts
  - `discount` (number): Discount amount
  - `itemCost` (number): Total cost of items (same as subtotal)
  - `tax` (number): Total tax amount
  - `cgst` (number): Central GST
  - `sgst` (number): State GST
  - `totalGst` (number): Total GST (CGST + SGST)
  - `handlingCharge` (number): Handling charge
  - `deliveryCharges` (number): **Delivery charges (proportional for this vendor)**
  - `totalAmount` (number): **Final total including delivery charges**
  - `totalCashback` (number): Total cashback earned
- `order` (object): Order summary
  - `_id` (string): Order MongoDB ObjectId
  - `orderNumber` (string): Order number
  - `status` (string): Order status
  - `items` (array): Simplified order items
    - `productName` (string): Product name
    - `quantity` (number): Quantity
    - `totalPrice` (number): Total price
  - `totalAmount` (number): Order total amount
- `createdAt` (string): Invoice creation timestamp (ISO 8601)
- `updatedAt` (string): Invoice last update timestamp (ISO 8601)

## Notes

1. **Multiple Invoices**: If an order has items from multiple vendors, the response will contain multiple invoice objects (one per vendor).

2. **Delivery Charges**: Delivery charges are calculated proportionally based on each vendor's subtotal relative to the total order subtotal. If only one vendor exists, the full delivery amount is assigned.

3. **Total Amount Calculation**: 
   ```
   totalAmount = subtotal + handlingCharge + tax + deliveryCharges - discount
   ```

4. **Sorting**: Invoices are sorted by `createdAt` in descending order (newest first).

5. **Date Format**: All dates are in ISO 8601 format (UTC).
