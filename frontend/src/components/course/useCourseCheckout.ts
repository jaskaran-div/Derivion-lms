"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { apiErrorMessage, paymentsAPI } from "@/lib/api";
import type { User } from "@/store/authStore";
import type { Course } from "./types";

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", cb: (resp: { error?: { description?: string } }) => void) => void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const loadRazorpay = () =>
  new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

// Enroll in a free course directly, or run Razorpay checkout for a paid one
export function useCourseCheckout(course: Course | null, user: User | null, onEnrolled: () => Promise<void> | void) {
  const [paying, setPaying] = useState(false);

  const enroll = async () => {
    if (!course) return;
    setPaying(true);

    if (course.isFree || Number(course.price) === 0) {
      try {
        await paymentsAPI.createOrder(course.id);
        toast.success("Enrolled successfully! 🎉");
        await onEnrolled();
      } catch (err) {
        toast.error(apiErrorMessage(err, "Enrollment failed."));
      } finally {
        setPaying(false);
      }
      return;
    }

    try {
      const res = await paymentsAPI.createOrder(course.id);
      const { orderId, amount, amountInPaise, currency, keyId, checkoutConfigId, prefill } = res.data.data;

      if (!(await loadRazorpay()) || !window.Razorpay) {
        toast.error("Payment checkout failed to load. Check your internet connection.");
        setPaying(false);
        return;
      }

      const razorpayKey = keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!razorpayKey) {
        toast.error("Payments are not configured yet.");
        setPaying(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: razorpayKey,
        amount: amountInPaise || Math.round(amount * 100),
        currency: currency || "INR",
        checkout_config_id: checkoutConfigId,
        name: "Derivion LMS",
        description: course.title,
        order_id: orderId,
        prefill: {
          name: prefill?.name || `${user?.firstName || ""} ${user?.lastName || ""}`.trim(),
          email: prefill?.email || user?.email || "",
          contact: prefill?.contact || "",
        },
        theme: { color: "#1d4ed8" },
        handler: async (response: RazorpayResponse) => {
          try {
            await paymentsAPI.verifyPayment(response);
            toast.success("Payment successful! You are now enrolled. 🎉");
            await onEnrolled();
          } catch (err) {
            toast.error(apiErrorMessage(err, "Failed to verify payment. If money was deducted, it will be confirmed shortly."));
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.on("payment.failed", (resp) => {
        toast.error(resp?.error?.description || "Payment failed.");
        setPaying(false);
      });
      rzp.open();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Payment failed to initiate."));
      setPaying(false);
    }
  };

  return { paying, enroll };
}
