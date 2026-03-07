# Rider Ticket API Documentation

This document provides details for the Rider Ticket APIs in the Rusk-basket system. These APIs allow riders to create and manage support tickets.

## Base URL
`{{BACKEND_URL}}/api/rider`

## Authentication
All endpoints require a Bearer Token in the Authorization header:
`Authorization: Bearer <rider_token>`

---

## 1. Create a New Ticket
Create a support request for delivery issues, account queries, or payment problems.

- **Method**: `POST`
- **Endpoint**: `/tickets`
- **Content-Type**: `application/json`

### Request Body
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `complaint` | `string` | Yes | Detailed description of the issue (10 - 2000 chars). |
| `category` | `string` | No | One of: `order_delivery`, `account_profile`, `payments_refunds`, `login_otp`, `general_queries`. Default: `general_queries`. |
| `orderId` | `string` | No | MongoDB ID of the related order. |

### Sample Request
```json
{
  "complaint": "The customer was not available at the delivery location.",
  "category": "order_delivery",
  "orderId": "65e8a1b2c3d4e5f67890abcd"
}
```

---

## 2. List All My Tickets
Retrieve a paginated list of tickets created by the authenticated rider.

- **Method**: `GET`
- **Endpoint**: `/tickets`

### Query Parameters
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `page` | `number` | Page number (default: 1). |
| `limit` | `number` | Items per page (default: 10, max: 100). |
| `status` | `string` | Filter by status: `active`, `pending`, `resolved`, `closed`. |
| `category` | `string` | Filter by category (see list in Create Ticket). |

---

## 3. Get Ticket Details
Fetch detailed information of a specific ticket, including its full message history.

- **Method**: `GET`
- **Endpoint**: `/tickets/:ticketId`

### Path Parameters
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `ticketId` | `string` | The MongoDB ID of the ticket. |

---

## 4. Add Message to Ticket
Send a follow-up message on an active or pending ticket.

- **Method**: `POST`
- **Endpoint**: `/tickets/:ticketId/messages`

### Request Body
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `message` | `string` | Yes | Message content (1 - 2000 chars). |

---

## Ticket Status Lifecycle
1.  **active**: Ticket is newly created and awaiting admin review.
2.  **pending**: Admin has started processing the ticket or requested more info.
3.  **resolved**: The issue has been addressed by the support team.
4.  **closed**: Final state. No more messages can be added.

## Important Notes
- Tickets can only be updated (complaint/category) through the user/vendor update endpoints (if applicable). Riders currently have create and message capabilities.
- Admins are automatically notified via FCM when a new ticket is created.
- Ensure the `orderId` is valid if provided, otherwise the request will fail validation.
