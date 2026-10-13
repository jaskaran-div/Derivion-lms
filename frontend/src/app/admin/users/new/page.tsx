"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { usersAPI } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";

const schema = z.object({
  firstName: z.string().min(2, "First name required"),
  lastName: z.string().min(2, "Last name required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  password: z.string().min(8, "Min 8 characters"),
  role: z.enum(["STUDENT", "ADMIN", "TEACHER"]),
});

type FormData = z.infer<typeof schema>;

export default function NewUserPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: "STUDENT" },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await usersAPI.create(data);
      toast.success("User created successfully!");
      router.push("/admin/users");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create user.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title">Add New User</h1>
            <p className="page-subtitle">Create a student, teacher, or admin account</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 600 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">User Details</span>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label required">First Name</label>
                  <input {...register("firstName")} className={`form-control ${errors.firstName ? "error" : ""}`} placeholder="John" />
                  {errors.firstName && <div className="form-error">{errors.firstName.message}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label required">Last Name</label>
                  <input {...register("lastName")} className={`form-control ${errors.lastName ? "error" : ""}`} placeholder="Doe" />
                  {errors.lastName && <div className="form-error">{errors.lastName.message}</div>}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label required">Email Address</label>
                <input {...register("email")} type="email" className={`form-control ${errors.email ? "error" : ""}`} placeholder="john@example.com" />
                {errors.email && <div className="form-error">{errors.email.message}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input {...register("phone")} type="tel" className="form-control" placeholder="+91 99999 99999" />
              </div>

              <div className="form-group">
                <label className="form-label required">Password</label>
                <input {...register("password")} type="password" className={`form-control ${errors.password ? "error" : ""}`} placeholder="Minimum 8 characters" />
                {errors.password && <div className="form-error">{errors.password.message}</div>}
              </div>

              <div className="form-group">
                <label className="form-label required">Role</label>
                <select {...register("role")} className="form-control">
                  <option value="STUDENT">Student</option>
                  <option value="TEACHER">Teacher</option>
                  <option value="ADMIN">Admin</option>
                </select>
                <div className="form-hint">Admins have full access to the management portal.</div>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
