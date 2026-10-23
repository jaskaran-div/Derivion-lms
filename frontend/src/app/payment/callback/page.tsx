"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { paymentsAPI } from "@/lib/api";
import toast from "react-hot-toast";
import Link from "next/link";

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("razorpay_order_id") || searchParams.get("order_id");
  // A callback without an order ID is invalid; no request needed to know that
  const [status, setStatus] = useState<"loading" | "success" | "failed">(orderId ? "loading" : "failed");
  const [message, setMessage] = useState(orderId ? "" : "Invalid payment response.");

  useEffect(() => {
    const paymentId = searchParams.get("razorpay_payment_id") || undefined;
    const signature = searchParams.get("razorpay_signature") || undefined;

    if (!orderId) return;

    paymentsAPI
      .verifyPayment({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
        orderId,
      })
      .then((res) => {
        if (res.data.success) {
          setStatus("success");
          toast.success("Payment successful! You are now enrolled. 🎉");
        } else {
          setStatus("failed");
          setMessage(res.data.message || "Payment not completed.");
        }
      })
      .catch(() => {
        setStatus("failed");
        setMessage("Failed to verify payment. Please contact support.");
      });
  }, [searchParams, orderId]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-body)",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "var(--radius-xl)",
          padding: "48px",
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
          boxShadow: "var(--shadow-xl)",
          border: "1px solid var(--border-color)",
        }}
      >
        {status === "loading" && (
          <>
            <div style={{ fontSize: 48, marginBottom: 20 }} className="animate-spin">⏳</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Verifying Payment...
            </h1>
            <p style={{ color: "var(--gray-500)", fontSize: 14 }}>
              Please wait while we confirm your payment.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "var(--success-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: 40,
              }}
            >
              ✅
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--gray-900)", marginBottom: 8 }}>
              Payment Successful!
            </h1>
            <p style={{ color: "var(--gray-500)", fontSize: 15, marginBottom: 28, lineHeight: 1.6 }}>
              🎉 Congratulations! You have been enrolled in the course. Start learning now!
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link href="/dashboard">
                <button className="btn btn-primary btn-lg">Go to Dashboard →</button>
              </Link>
              <Link href="/my-courses">
                <button className="btn btn-secondary btn-lg">My Courses</button>
              </Link>
            </div>
          </>
        )}

        {status === "failed" && (
          <>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "var(--danger-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: 40,
              }}
            >
              ❌
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "var(--gray-900)", marginBottom: 8 }}>
              Payment Failed
            </h1>
            <p style={{ color: "var(--gray-500)", fontSize: 15, marginBottom: 28, lineHeight: 1.6 }}>
              {message || "Something went wrong with your payment. Please try again or contact support."}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={() => router.back()}>
                ← Go Back
              </button>
              <Link href="/courses">
                <button className="btn btn-primary">Browse Courses</button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading payment details...</div>}>
      <PaymentCallbackContent />
    </Suspense>
  );
}
