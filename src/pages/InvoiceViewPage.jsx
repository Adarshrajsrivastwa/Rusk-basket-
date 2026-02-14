import React, { useState, useEffect } from "react";
import DashboardLayout from "../../components/DashboardLayout";
import { useLocation, useParams } from "react-router-dom";
import { BASE_URL } from "../../api/api";
import {
  Download,
  Printer,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  Package,
  User,
  Building,
  FileText,
  Globe,
  AlertCircle,
} from "lucide-react";

const InvoiceViewPage = () => {
  const location = useLocation();
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInvoiceDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get invoice ID from location state or params
        const invoiceId =
          location.state?.invoice?.id ||
          params.invoiceId ||
          location.state?.invoiceId;

        if (!invoiceId) {
          throw new Error("No invoice ID provided");
        }

        // Get token from localStorage
        const token =
          localStorage.getItem("token") || localStorage.getItem("authToken");

        const headers = {
          "Content-Type": "application/json",
        };

        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(
          `${BASE_URL}/api/invoice/${invoiceId}`,
          {
            method: "GET",
            credentials: "include",
            headers: headers,
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch invoice: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data) {
          const apiInvoice = result.data;

          // Transform API data to match component structure
          const transformedInvoice = {
            id: apiInvoice._id, // Keep _id for API calls
            code: apiInvoice.code || apiInvoice._id, // Use code for display, fallback to _id
            invoiceNumber: apiInvoice.invoiceNumber,
            date: apiInvoice.date || apiInvoice.createdAt,
            dueDate: apiInvoice.dueDate,
            orderId:
              apiInvoice.orderNumber || apiInvoice.order?.orderNumber || "N/A",

            // User details
            user: apiInvoice.user?.userName || "N/A",
            userEmail: apiInvoice.user?.email || "N/A",
            userPhone: apiInvoice.user?.contactNumber || "N/A",
            userAddress: apiInvoice.user?.address || "Address not available",
            userId: apiInvoice.user?._id,

            // Vendor details
            vendor:
              apiInvoice.vendor?.vendorName ||
              apiInvoice.vendor?.storeName ||
              "N/A",
            vendorId: apiInvoice.vendor?._id,

            // Payment details
            payment: apiInvoice.payment?.method?.toUpperCase() || "COD",
            paymentStatus: apiInvoice.payment?.status || "pending",
            status: capitalizeStatus(apiInvoice.status),

            // Items
            items: apiInvoice.items.map((item, index) => ({
              id: item._id || index + 1,
              sku: item.sku || "N/A",
              hssn: item.hssn || "N/A",
              description: item.description || item.productName || "N/A",
              productName: item.productName,
              quantity: item.quantity || 0,
              unitPrice: item.unitPrice || 0,
              total: item.totalPrice || item.quantity * item.unitPrice || 0,
            })),

            // Pricing
            itemCost:
              apiInvoice.pricing?.itemCost || apiInvoice.pricing?.subtotal || 0,
            cgst: apiInvoice.pricing?.cgst || 0,
            sgst: apiInvoice.pricing?.sgst || 0,
            totalGst:
              apiInvoice.pricing?.totalGst || apiInvoice.pricing?.tax || 0,
            handlingCharges: apiInvoice.pricing?.handlingCharge || 0,
            discount: apiInvoice.pricing?.discount || 0,
            cashback: apiInvoice.pricing?.totalCashback || 0,
            total: apiInvoice.amount || apiInvoice.pricing?.totalAmount || 0,

            // Notes and terms
            notes:
              apiInvoice.notes ||
              "Thank you for your business. Payment due within 30 days.",
            terms:
              apiInvoice.terms ||
              "Please pay within 30 days of invoice date. Late payments may incur additional charges.",
          };

          setInvoice(transformedInvoice);
        } else {
          throw new Error("Invalid API response");
        }
      } catch (err) {
        console.error("Error fetching invoice details:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInvoiceDetails();
  }, [location.state, params.invoiceId]);

  // Helper function to capitalize status
  const capitalizeStatus = (status) => {
    if (!status) return "Pending";
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  const handlePrint = () => window.print();

  const handleDownload = () => {
    // Implement download functionality
    alert("Download functionality would be implemented here");
  };

  const handleBack = () => window.history.back();

  const statusColors = {
    Paid: "bg-green-50 text-green-700 border-green-500",
    Pending: "bg-yellow-50 text-yellow-700 border-yellow-500",
    Cancelled: "bg-red-50 text-red-700 border-red-500",
    Completed: "bg-green-50 text-green-700 border-green-500",
    Failed: "bg-red-50 text-red-700 border-red-500",
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // Loading State
  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-white p-6">
          <div className="max-w-5xl mx-auto">
            <div
              className="bg-white rounded-lg shadow-xl p-8 animate-pulse border-2"
              style={{ borderColor: "#FF7B1D" }}
            >
              <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded w-full"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                <div className="h-4 bg-gray-200 rounded w-4/6"></div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Error State
  if (error || !invoice) {
    return (
      <DashboardLayout>
        <div className="min-h-screen bg-white p-6">
          <div className="max-w-5xl mx-auto">
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-8">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
                <h3 className="text-red-800 font-bold text-xl">
                  Error Loading Invoice
                </h3>
              </div>
              <p className="text-red-600 mb-4">
                {error || "Invoice not found"}
              </p>
              <button
                onClick={handleBack}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-sm shadow-md transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Invoices
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-white p-6">
        <div className="max-w-5xl mx-auto">
          {/* Action Bar */}
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-50 text-black font-bold rounded-sm shadow-md border-2 transition-all hover:scale-105"
              style={{ borderColor: "#FF7B1D" }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Invoices
            </button>
            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-5 py-2.5 text-white font-bold rounded-sm shadow-md transition-all hover:scale-105"
                style={{ backgroundColor: "#FF7B1D" }}
                onMouseEnter={(e) =>
                  (e.target.style.backgroundColor = "#E66A0D")
                }
                onMouseLeave={(e) =>
                  (e.target.style.backgroundColor = "#FF7B1D")
                }
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white font-bold rounded-sm shadow-md transition-all hover:scale-105"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>
          </div>

          {/* Invoice Container */}
          <div
            className="bg-white rounded-sm shadow-xl overflow-hidden border-2"
            style={{ borderColor: "#FF7B1D" }}
          >
            {/* Header */}
            <div
              className="text-white p-8"
              style={{ backgroundColor: "#FF7B1D" }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-4xl font-bold mb-2">INVOICE</h1>
                  <p className="text-white text-lg font-semibold">
                    Code: {invoice.code || invoice.invoiceNumber}
                  </p>
                  <p className="text-white text-sm mt-1 opacity-90">
                    Invoice #: {invoice.invoiceNumber}
                  </p>
                </div>
                <div className="text-right">
                  <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
                    <p className="text-xs uppercase tracking-wider mb-1 text-white">
                      Status
                    </p>
                    <span
                      className={`inline-block px-4 py-2 rounded-sm text-sm font-bold border-2 ${
                        statusColors[invoice.status] || statusColors.Pending
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8">
              {/* Date Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div
                  className="bg-white rounded-lg p-4 border-2 shadow-md"
                  style={{ borderColor: "#FF7B1D" }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Calendar
                      className="w-5 h-5"
                      style={{ color: "#FF7B1D" }}
                    />
                    <p className="text-xs font-bold text-black uppercase tracking-wide">
                      Invoice Date
                    </p>
                  </div>
                  <p className="text-lg font-bold text-black">
                    {formatDate(invoice.date)}
                  </p>
                </div>
                <div
                  className="bg-white rounded-sm p-4 border-2 shadow-md"
                  style={{ borderColor: "#FF7B1D" }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Calendar
                      className="w-5 h-5"
                      style={{ color: "#FF7B1D" }}
                    />
                    <p className="text-xs font-bold text-black uppercase tracking-wide">
                      Due Date
                    </p>
                  </div>
                  <p className="text-lg font-bold text-black">
                    {formatDate(invoice.dueDate)}
                  </p>
                </div>
                <div
                  className="bg-white rounded-sm p-4 border-2 shadow-md"
                  style={{ borderColor: "#FF7B1D" }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Package className="w-5 h-5" style={{ color: "#FF7B1D" }} />
                    <p className="text-xs font-bold text-black uppercase tracking-wide">
                      Order ID
                    </p>
                  </div>
                  <p className="text-lg font-bold text-black">
                    {invoice.orderId}
                  </p>
                </div>
              </div>

              {/* Company and Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Company Info */}
                <div
                  className="bg-white rounded-sm p-6 border-2 shadow-md"
                  style={{ borderColor: "#FF7B1D" }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="p-2 rounded-sm"
                      style={{ backgroundColor: "#FF7B1D" }}
                    >
                      <Building className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-black">
                      Company Details
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xl font-bold text-black">
                      Rush Delivery Services
                    </p>
                    <div className="flex items-start gap-2 text-sm text-black">
                      <Mail
                        className="w-4 h-4 mt-0.5"
                        style={{ color: "#FF7B1D" }}
                      />
                      <span>info@rushdelivery.com</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-black">
                      <Phone
                        className="w-4 h-4 mt-0.5"
                        style={{ color: "#FF7B1D" }}
                      />
                      <span>+91 1800 123 4567</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-black">
                      <MapPin
                        className="w-4 h-4 mt-0.5"
                        style={{ color: "#FF7B1D" }}
                      />
                      <span>
                        123 Business Park, Patna, Bihar - 800001, India
                      </span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-black">
                      <Globe
                        className="w-4 h-4 mt-0.5"
                        style={{ color: "#FF7B1D" }}
                      />
                      <span>www.rushdelivery.com</span>
                    </div>
                    <div
                      className="mt-3 pt-3 border-t-2"
                      style={{ borderColor: "#FF7B1D" }}
                    >
                      <p className="text-xs font-bold text-black">
                        GSTIN: 10AABCU9603R1ZM
                      </p>
                      <p className="text-xs font-bold text-black">
                        PAN: AABCU9603R
                      </p>
                    </div>
                  </div>
                </div>

                {/* Customer Info */}
                <div
                  className="bg-white rounded-sm p-6 border-2 shadow-md"
                  style={{ borderColor: "#FF7B1D" }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="p-2 rounded-lg"
                      style={{ backgroundColor: "#FF7B1D" }}
                    >
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-black">Bill To</h3>
                  </div>
                  <div className="space-y-3">
                    <p className="text-xl font-bold text-black">
                      {invoice.user}
                    </p>
                    <div className="flex items-start gap-2 text-sm text-black">
                      <Mail
                        className="w-4 h-4 mt-0.5"
                        style={{ color: "#FF7B1D" }}
                      />
                      <span>{invoice.userEmail}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-black">
                      <Phone
                        className="w-4 h-4 mt-0.5"
                        style={{ color: "#FF7B1D" }}
                      />
                      <span>{invoice.userPhone}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-black">
                      <MapPin
                        className="w-4 h-4 mt-0.5"
                        style={{ color: "#FF7B1D" }}
                      />
                      <span>{invoice.userAddress}</span>
                    </div>
                    {invoice.vendor !== "N/A" && (
                      <div
                        className="mt-3 pt-3 border-t-2"
                        style={{ borderColor: "#FF7B1D" }}
                      >
                        <p className="text-sm font-bold text-black">
                          Vendor: {invoice.vendor}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div
                className="bg-white rounded-sm p-4 border-2 shadow-md mb-8"
                style={{ borderColor: "#FF7B1D" }}
              >
                <div className="flex items-center gap-3">
                  <CreditCard
                    className="w-5 h-5"
                    style={{ color: "#FF7B1D" }}
                  />
                  <p className="text-sm font-bold text-black">
                    Payment Method:{" "}
                    <span
                      className="ml-2 px-3 py-1 rounded-sm text-xs text-white font-bold"
                      style={{ backgroundColor: "#FF7B1D" }}
                    >
                      {invoice.payment}
                    </span>
                    <span className="ml-3 text-xs text-gray-600">
                      Status:{" "}
                      <span
                        className={`font-bold ${
                          invoice.paymentStatus === "completed"
                            ? "text-green-600"
                            : invoice.paymentStatus === "pending"
                              ? "text-yellow-600"
                              : "text-red-600"
                        }`}
                      >
                        {invoice.paymentStatus?.toUpperCase()}
                      </span>
                    </span>
                  </p>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-8">
                <h3 className="text-lg font-bold text-black mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5" style={{ color: "#FF7B1D" }} />
                  Invoice Items
                </h3>
                <div
                  className="overflow-x-auto border-2 rounded-sm"
                  style={{ borderColor: "#FF7B1D" }}
                >
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        className="text-white"
                        style={{ backgroundColor: "#FF7B1D" }}
                      >
                        <th className="p-4 text-left font-bold">SKU/HSSN</th>
                        <th className="p-4 text-left font-bold">Description</th>
                        <th className="p-4 text-center font-bold">Quantity</th>
                        <th className="p-4 text-right font-bold">Unit Price</th>
                        <th className="p-4 text-right font-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item, idx) => (
                        <tr
                          key={item.id}
                          className={
                            idx % 2 === 0 ? "bg-orange-50" : "bg-white"
                          }
                        >
                          <td
                            className="p-4 text-black font-medium border-b"
                            style={{ borderColor: "#FFE5D0" }}
                          >
                            {item.sku !== "N/A" && (
                              <div className="text-xs text-gray-600">
                                SKU: {item.sku}
                              </div>
                            )}
                            {item.hssn !== "N/A" && (
                              <div className="text-xs text-gray-600">
                                HSSN: {item.hssn}
                              </div>
                            )}
                            {item.sku === "N/A" && item.hssn === "N/A" && (
                              <div className="text-xs text-gray-400">
                                Not Available
                              </div>
                            )}
                          </td>
                          <td
                            className="p-4 text-black font-medium border-b"
                            style={{ borderColor: "#FFE5D0" }}
                          >
                            {item.description}
                          </td>
                          <td
                            className="p-4 text-center text-black font-semibold border-b"
                            style={{ borderColor: "#FFE5D0" }}
                          >
                            {item.quantity}
                          </td>
                          <td
                            className="p-4 text-right text-black font-semibold border-b"
                            style={{ borderColor: "#FFE5D0" }}
                          >
                            ₹{item.unitPrice.toLocaleString()}
                          </td>
                          <td
                            className="p-4 text-right font-bold border-b"
                            style={{ color: "#FF7B1D", borderColor: "#FFE5D0" }}
                          >
                            ₹{item.total.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-full md:w-1/2">
                  <div
                    className="bg-white rounded-sm p-6 border-2 shadow-md"
                    style={{ borderColor: "#FF7B1D" }}
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-black font-semibold">
                          Item Cost:
                        </span>
                        <span className="text-black font-bold">
                          ₹{invoice.itemCost.toLocaleString()}
                        </span>
                      </div>
                      {invoice.cgst > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-black font-semibold">
                            CGST:
                          </span>
                          <span className="text-black font-bold">
                            ₹{invoice.cgst.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {invoice.sgst > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-black font-semibold">
                            SGST:
                          </span>
                          <span className="text-black font-bold">
                            ₹{invoice.sgst.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {invoice.totalGst > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-black font-semibold">
                            Total GST:
                          </span>
                          <span className="text-black font-bold">
                            ₹{invoice.totalGst.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {invoice.handlingCharges > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-black font-semibold">
                            Handling Charges:
                          </span>
                          <span className="text-black font-bold">
                            ₹{invoice.handlingCharges.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {invoice.discount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span className="font-semibold">Discount:</span>
                          <span className="font-bold">
                            -₹{invoice.discount.toLocaleString()}
                          </span>
                        </div>
                      )}
                      {invoice.cashback > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span className="font-semibold">Cashback:</span>
                          <span className="font-bold">
                            ₹{invoice.cashback.toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div
                        className="border-t-2 pt-3 mt-3"
                        style={{ borderColor: "#FF7B1D" }}
                      >
                        <div className="flex justify-between">
                          <span className="text-lg font-bold text-black">
                            Total Amount:
                          </span>
                          <span
                            className="text-2xl font-bold"
                            style={{ color: "#FF7B1D" }}
                          >
                            ₹{invoice.total.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes and Terms */}
              {(invoice.notes || invoice.terms) && (
                <div className="mt-8 space-y-4">
                  {invoice.notes && (
                    <div
                      className="bg-white rounded-sm p-4 border-2 shadow-sm"
                      style={{ borderColor: "#FF7B1D" }}
                    >
                      <h4 className="font-bold text-black mb-2">Notes:</h4>
                      <p className="text-sm text-black">{invoice.notes}</p>
                    </div>
                  )}
                  {invoice.terms && (
                    <div
                      className="bg-white rounded-sm p-4 border-2 shadow-sm"
                      style={{ borderColor: "#FF7B1D" }}
                    >
                      <h4 className="font-bold text-black mb-2">
                        Terms & Conditions:
                      </h4>
                      <p className="text-sm text-black">{invoice.terms}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="bg-white p-6 border-t-2"
              style={{ borderColor: "#FF7B1D" }}
            >
              <p className="text-center text-sm text-black font-semibold">
                Thank you for your business! For any queries, please contact us.
              </p>
              <p className="text-center text-xs text-gray-600 mt-2">
                This is a computer-generated invoice and does not require a
                signature.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default InvoiceViewPage;
