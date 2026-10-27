"use client";

import { useEffect, useState, useCallback } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { apiErrorMessage, usersAPI, displayLogin } from "@/lib/api";
import toast from "react-hot-toast";
import { CreditCard } from "lucide-react";

interface Payment {
  id: string;
  amount: number;
  status: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  cashfreeOrderId?: string;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string };
  course: { title: string } | null;
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchPayments = useCallback(() => {
    const params: Record<string, string | number> = { page, limit };
    if (status) params.status = status;
    return usersAPI.getPayments(params)
      .then((res) => {
        setPayments(res.data.data.payments);
        setTotal(res.data.data.pagination.total);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
      });
  }, [page, status]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const [refunding, setRefunding] = useState<string | null>(null);

  const handleRefund = async (payment: Payment) => {
    const name = `${payment.user.firstName} ${payment.user.lastName}`;
    const reason = window.prompt(`Refund ${formatCurrency(parseFloat(String(payment.amount)))} to ${name}? Their course access will be removed.

Reason (optional):`, "");
    if (reason === null) return;
    setRefunding(payment.id);
    try {
      await usersAPI.refundPayment(payment.id, reason || undefined);
      toast.success("Refund issued and course access removed.");
      fetchPayments();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Refund failed."));
    } finally {
      setRefunding(null);
    }
  };

  const getStatusBadge = (s: string) => {
    const map: Record<string, string> = {
      SUCCESS: "badge-success",
      PENDING: "badge-warning",
      FAILED: "badge-danger",
      REFUNDED: "badge-gray",
    };
    return <span className={`badge badge-dot ${map[s] || "badge-gray"}`}>{s.charAt(0) + s.slice(1).toLowerCase()}</span>;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const totalRevenue = payments.filter(p => p.status === "SUCCESS").reduce((sum, p) => sum + parseFloat(String(p.amount)), 0);

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">{total} total transactions</p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card green">
          <div className="stat-icon green"><CreditCard size={22} /></div>
          <div className="stat-value">{formatCurrency(totalRevenue)}</div>
          <div className="stat-label">Revenue (this page)</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon blue"><CreditCard size={22} /></div>
          <div className="stat-value">{payments.filter(p => p.status === "SUCCESS").length}</div>
          <div className="stat-label">Successful Payments</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-icon yellow"><CreditCard size={22} /></div>
          <div className="stat-value">{payments.filter(p => p.status === "PENDING").length}</div>
          <div className="stat-label">Pending Payments</div>
        </div>
        <div className="stat-card purple">
          <div className="stat-icon purple"><CreditCard size={22} /></div>
          <div className="stat-value">{payments.filter(p => p.status === "FAILED").length}</div>
          <div className="stat-label">Failed Payments</div>
        </div>
      </div>

      {/* Filter */}
      <div className="card" style={{ padding: "14px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <select className="form-control" style={{ width: 160 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="SUCCESS">Successful</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>Student</th>
              <th>Course</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4,5].map(i => (
                <tr key={i}>
                  {[1,2,3,4,5,6,7].map(j => <td key={j}><div className="skeleton" style={{ height: 16 }} /></td>)}
                </tr>
              ))
            ) : payments.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-state-icon">💳</div>
                    <div className="empty-state-title">No payments found</div>
                  </div>
                </td>
              </tr>
            ) : payments.map((payment) => (
              <tr key={payment.id}>
                <td>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--gray-600)" }}>
                    {payment.razorpayOrderId || payment.cashfreeOrderId || payment.id.slice(0, 12)}...
                  </div>
                </td>
                <td>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {payment.user.firstName} {payment.user.lastName}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--gray-400)" }}>{displayLogin(payment.user)}</div>
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: 13, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {payment.course?.title || "Deleted course"}
                  </div>
                </td>
                <td>
                  <div style={{ fontWeight: 700, color: payment.status === "SUCCESS" ? "var(--success)" : "var(--gray-800)" }}>
                    {formatCurrency(parseFloat(String(payment.amount)))}
                  </div>
                </td>
                <td>{getStatusBadge(payment.status)}</td>
                <td>
                  <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
                    {formatDate(payment.createdAt)}
                  </div>
                </td>
                <td>
                  {payment.status === "SUCCESS" && payment.razorpayPaymentId && (
                    <button className="btn btn-secondary btn-sm" disabled={refunding === payment.id} onClick={() => handleRefund(payment)}>
                      {refunding === payment.id ? "Refunding…" : "Refund"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > limit && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={{ fontSize: 13, color: "var(--gray-500)", padding: "7px 0" }}>Page {page} of {Math.ceil(total / limit)}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </AppLayout>
  );
}
