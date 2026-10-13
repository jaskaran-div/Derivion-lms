"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import { usersAPI } from "@/lib/api";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  ExternalLink,
  BookOpen,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";

interface PaymentRecord {
  id: string;
  amount: number | string;
  currency: string;
  status: "SUCCESS" | "PENDING" | "FAILED";
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  cashfreeOrderId?: string | null;
  createdAt: string;
  course: {
    title: string;
    thumbnail?: string | null;
    slug: string;
  };
}

export default function StudentPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  useEffect(() => {
    usersAPI
      .getPaymentHistory()
      .then((res) => {
        setPayments(res.data.data || []);
      })
      .catch((err) => {
        console.error("Failed to load payment history:", err);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const matchesSearch =
        p.course?.title.toLowerCase().includes(search.toLowerCase()) ||
        (p.razorpayOrderId && p.razorpayOrderId.toLowerCase().includes(search.toLowerCase())) ||
        (p.razorpayPaymentId && p.razorpayPaymentId.toLowerCase().includes(search.toLowerCase())) ||
        p.id.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "ALL" || p.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [payments, search, statusFilter]);

  const stats = useMemo(() => {
    const totalSpent = payments
      .filter((p) => p.status === "SUCCESS")
      .reduce((sum, p) => sum + parseFloat(String(p.amount || 0)), 0);

    const successfulCount = payments.filter((p) => p.status === "SUCCESS").length;
    const pendingCount = payments.filter((p) => p.status === "PENDING").length;

    return { totalSpent, successfulCount, pendingCount };
  }, [payments]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: PaymentRecord["status"]) => {
    switch (status) {
      case "SUCCESS":
        return (
          <span className="badge badge-success" style={{ gap: 4 }}>
            <CheckCircle2 size={12} /> Success
          </span>
        );
      case "PENDING":
        return (
          <span className="badge badge-warning" style={{ gap: 4 }}>
            <Clock size={12} /> Pending
          </span>
        );
      case "FAILED":
        return (
          <span className="badge badge-danger" style={{ gap: 4 }}>
            <XCircle size={12} /> Failed
          </span>
        );
      default:
        return <span className="badge badge-gray">{status}</span>;
    }
  };

  return (
    <AppLayout requiredRole="ANY">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Payments</h1>
          <p className="page-subtitle">
            View all your transaction receipts, invoices, and course purchase history.
          </p>
        </div>
        <Link href="/courses">
          <button className="btn btn-secondary">
            <BookOpen size={16} /> Browse Courses
          </button>
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ background: "var(--primary-50)", color: "var(--primary)" }}
          >
            <CreditCard size={20} />
          </div>
          <div className="stat-value">
            ₹{stats.totalSpent.toLocaleString("en-IN")}
          </div>
          <div className="stat-label">Total Invested</div>
        </div>

        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ background: "#ecfdf5", color: "#059669" }}
          >
            <CheckCircle2 size={20} />
          </div>
          <div className="stat-value">{stats.successfulCount}</div>
          <div className="stat-label">Successful Transactions</div>
        </div>

        <div className="stat-card">
          <div
            className="stat-icon"
            style={{ background: "#eff6ff", color: "#2563eb" }}
          >
            <ShieldCheck size={20} />
          </div>
          <div className="stat-value">Razorpay</div>
          <div className="stat-label">Secure Gateway</div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card">
        <div
          className="card-header"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span className="card-title">Transaction History</span>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--gray-400)",
                }}
              />
              <input
                type="text"
                className="input"
                placeholder="Search course or order ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 36, height: 38, width: 220 }}
              />
            </div>

            {/* Filter by status */}
            <select
              className="input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ height: 38, width: 140 }}
            >
              <option value="ALL">All Statuses</option>
              <option value="SUCCESS">Success</option>
              <option value="PENDING">Pending</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>
        </div>

        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center" }}>
              <div className="loading-spinner" style={{ margin: "0 auto 16px" }} />
              <p style={{ color: "var(--gray-500)", fontSize: 14 }}>
                Loading your payment records...
              </p>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="empty-state" style={{ padding: "64px 20px" }}>
              <div className="empty-state-icon">💳</div>
              <div className="empty-state-title">
                {payments.length === 0 ? "No payment history yet" : "No matching transactions"}
              </div>
              <div className="empty-state-text" style={{ maxWidth: 400 }}>
                {payments.length === 0
                  ? "When you purchase or enroll in paid courses, all your invoices and transaction records will appear right here."
                  : "Try clearing your search query or changing the status filter to see other records."}
              </div>
              {payments.length === 0 && (
                <Link href="/courses">
                  <button className="btn btn-primary" style={{ marginTop: 16 }}>
                    Explore Courses
                  </button>
                </Link>
              )}
            </div>
          ) : (
            <div className="table-container" style={{ border: 0, boxShadow: "none" }}>
              <table>
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Order & Payment ID</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => {
                    const orderReference =
                      p.razorpayOrderId || p.cashfreeOrderId || p.id;
                    return (
                      <tr key={p.id}>
                        <td>
                          <div>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                              {p.course?.title || "Course Enrollment"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--gray-400)" }}>
                              {p.currency || "INR"}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div>
                            <code style={{ fontSize: 12 }}>
                              {orderReference.slice(0, 18)}
                              {orderReference.length > 18 ? "..." : ""}
                            </code>
                            {p.razorpayPaymentId && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--gray-500)",
                                  marginTop: 2,
                                }}
                              >
                                Pay ID: {p.razorpayPaymentId}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            ₹{parseFloat(String(p.amount)).toLocaleString("en-IN")}
                          </div>
                        </td>
                        <td>{getStatusBadge(p.status)}</td>
                        <td>
                          <span style={{ fontSize: 13, color: "var(--gray-600)" }}>
                            {formatDate(p.createdAt)}
                          </span>
                        </td>
                        <td>
                          {p.course?.slug && (
                            <Link href={`/courses/${p.course.slug}`}>
                              <button
                                className="btn btn-ghost"
                                style={{ height: 32, padding: "0 10px", fontSize: 12 }}
                              >
                                View Course <ArrowUpRight size={14} />
                              </button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
