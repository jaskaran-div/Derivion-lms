"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { schoolsAPI, apiErrorMessage } from "@/lib/api";
import {
  Building2, Plus, Search, Users, BookOpen, ChevronRight, MapPin, Phone, Mail, Layers, Edit, Trash2, CheckCircle, XCircle,
} from "lucide-react";
import Link from "next/link";

interface School {
  id: string;
  name: string;
  code: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: string;
  _count: { memberships: number; classes: number; courseAssignments: number };
}

export default function SchoolsManagementPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState({
    name: "", code: "", address: "", city: "", state: "",
    pincode: "", phone: "", email: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");


  const loadSchools = () => {
    return schoolsAPI.list({ search: search || undefined, limit: 50 })
      .then((res) => {
        setSchools(res.data.data.schools);
        setTotal(res.data.data.pagination.total);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => { loadSchools(); }, [search]);

  const openCreate = () => {
    setEditingSchool(null);
    setForm({ name: "", code: "", address: "", city: "", state: "", pincode: "", phone: "", email: "" });
    setError("");
    setShowModal(true);
  };

  const openEdit = (school: School) => {
    setEditingSchool(school);
    setForm({
      name: school.name, code: school.code, address: "",
      city: school.city || "", state: school.state || "",
      pincode: "", phone: school.phone || "", email: school.email || "",
    });
    setError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) {
      setError("School name and code are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editingSchool) {
        await schoolsAPI.update(editingSchool.id, form);
      } else {
        await schoolsAPI.create(form);
      }
      setShowModal(false);
      loadSchools();
    } catch (err) {
      setError(apiErrorMessage(err, "Failed to save school."));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Deactivate this school? It will be hidden but not deleted.")) return;
    try {
      await schoolsAPI.delete(id);
      loadSchools();
    } catch {}
  };

  return (
    <AppLayout>
      <div className="schools-page">
        {/* Header */}
        <div className="schools-header">
          <div className="schools-title-area">
            <div className="schools-icon-wrap">
              <Building2 size={28} />
            </div>
            <div>
              <h1 className="schools-title">School Management</h1>
              <p className="schools-subtitle">
                Manage institutions, classes, academic years and student batches
              </p>
            </div>
          </div>
          <button className="schools-add-btn" onClick={openCreate}>
            <Plus size={18} />
            Add School
          </button>
        </div>

        {/* Stats bar */}
        <div className="schools-stats">
          <div className="schools-stat-card">
            <Building2 size={20} className="stat-icon stat-blue" />
            <div>
              <div className="stat-value">{total}</div>
              <div className="stat-label">Total Schools</div>
            </div>
          </div>
          <div className="schools-stat-card">
            <Users size={20} className="stat-icon stat-green" />
            <div>
              <div className="stat-value">
                {schools.reduce((a, s) => a + s._count.memberships, 0)}
              </div>
              <div className="stat-label">Total Members</div>
            </div>
          </div>
          <div className="schools-stat-card">
            <Layers size={20} className="stat-icon stat-purple" />
            <div>
              <div className="stat-value">
                {schools.reduce((a, s) => a + s._count.classes, 0)}
              </div>
              <div className="stat-label">Total Classes</div>
            </div>
          </div>
          <div className="schools-stat-card">
            <BookOpen size={20} className="stat-icon stat-orange" />
            <div>
              <div className="stat-value">
                {schools.reduce((a, s) => a + s._count.courseAssignments, 0)}
              </div>
              <div className="stat-label">Course Assignments</div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="schools-search-bar">
          <Search size={18} className="search-icon" />
          <input
            className="schools-search-input"
            placeholder="Search schools by name, code or city..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Schools Grid */}
        {loading ? (
          <div className="schools-loading">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="school-card-skeleton" />
            ))}
          </div>
        ) : schools.length === 0 ? (
          <div className="schools-empty">
            <Building2 size={48} className="empty-icon" />
            <h3>No schools yet</h3>
            <p>Add your first school to get started with multi-school management.</p>
            <button className="schools-add-btn" onClick={openCreate}>
              <Plus size={16} /> Add First School
            </button>
          </div>
        ) : (
          <div className="schools-grid">
            {schools.map((school) => (
              <div key={school.id} className={`school-card ${!school.isActive ? "school-card--inactive" : ""}`}>
                <div className="school-card-header">
                  <div className="school-badge">{school.code}</div>
                  <div className="school-card-actions">
                    <button className="school-action-btn" onClick={() => openEdit(school)} title="Edit">
                      <Edit size={15} />
                    </button>
                    <button
                      className="school-action-btn school-action-danger"
                      onClick={() => handleDeactivate(school.id)}
                      title="Deactivate"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <h3 className="school-name">{school.name}</h3>

                <div className="school-meta">
                  {(school.city || school.state) && (
                    <span className="school-meta-item">
                      <MapPin size={13} />
                      {[school.city, school.state].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {school.phone && (
                    <span className="school-meta-item">
                      <Phone size={13} />
                      {school.phone}
                    </span>
                  )}
                  {school.email && (
                    <span className="school-meta-item">
                      <Mail size={13} />
                      {school.email}
                    </span>
                  )}
                </div>

                <div className="school-stats-row">
                  <div className="school-stat">
                    <Users size={14} />
                    <span>{school._count.memberships} members</span>
                  </div>
                  <div className="school-stat">
                    <Layers size={14} />
                    <span>{school._count.classes} classes</span>
                  </div>
                  <div className="school-stat">
                    <BookOpen size={14} />
                    <span>{school._count.courseAssignments} courses</span>
                  </div>
                </div>

                <div className="school-status-row">
                  <span className={`school-status ${school.isActive ? "school-status--active" : "school-status--inactive"}`}>
                    {school.isActive ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {school.isActive ? "Active" : "Inactive"}
                  </span>
                  <Link href={`/admin/schools/${school.id}`} className="school-manage-link">
                    Manage
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-box school-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingSchool ? "Edit School" : "Add New School"}</h2>
                <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
              </div>

              {error && <div className="modal-error">{error}</div>}

              <div className="modal-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>School Name *</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Delhi Public School"
                    />
                  </div>
                  <div className="form-group">
                    <label>School Code * (unique ID)</label>
                    <input
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                      placeholder="e.g. DPS001"
                      disabled={!!editingSchool}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Address</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="Street address"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>City</label>
                    <input
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                      placeholder="City"
                    />
                  </div>
                  <div className="form-group">
                    <label>State</label>
                    <input
                      value={form.state}
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                      placeholder="State"
                    />
                  </div>
                  <div className="form-group">
                    <label>Pincode</label>
                    <input
                      value={form.pincode}
                      onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
                      placeholder="110001"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Contact Phone</label>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+91..."
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Email</label>
                    <input
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="principal@school.edu"
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : editingSchool ? "Update School" : "Create School"}
                </button>
              </div>
            </div>
          </div>
        )}

        <style jsx>{`
          .schools-page {
            --card-bg: #ffffff;
            --border: #e2e8f0;
            --text-primary: #0f172a;
            --text-secondary: #64748b;
            --input-bg: #ffffff;
            --hover: #f8fafc;
            padding: 0;
          }
          .schools-header {
            display: flex; align-items: center; justify-content: space-between;
            margin-bottom: 2rem; gap: 1rem; flex-wrap: wrap;
          }
          .schools-title-area { display: flex; align-items: center; gap: 1rem; }
          .schools-icon-wrap {
            width: 52px; height: 52px; border-radius: 14px;
            background: linear-gradient(135deg, #1d4ed8, #8b5cf6);
            display: flex; align-items: center; justify-content: center; color: white;
            box-shadow: 0 4px 15px rgba(29, 78, 216,0.35);
          }
          .schools-title { font-size: 1.6rem; font-weight: 700; color: #0f172a; margin: 0; }
          .schools-subtitle { color: #64748b; font-size: 0.875rem; margin: 0; }
          .schools-add-btn {
            display: flex; align-items: center; gap: 0.5rem;
            background: linear-gradient(135deg, #1d4ed8, #8b5cf6);
            color: white; border: none; padding: 0.65rem 1.25rem;
            border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 0.9rem;
            box-shadow: 0 4px 12px rgba(29, 78, 216,0.35);
            transition: transform 0.15s, box-shadow 0.15s;
          }
          .schools-add-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(29, 78, 216,0.45); }

          .schools-stats {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 1rem; margin-bottom: 1.75rem;
          }
          .schools-stat-card {
            background: #ffffff; border: 1px solid #e2e8f0;
            border-radius: 12px; padding: 1.1rem 1.25rem;
            display: flex; align-items: center; gap: 0.85rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          }
          .stat-icon { flex-shrink: 0; }
          .stat-blue { color: #1d4ed8; }
          .stat-green { color: #10b981; }
          .stat-purple { color: #8b5cf6; }
          .stat-orange { color: #f59e0b; }
          .stat-value { font-size: 1.5rem; font-weight: 700; color: #0f172a; line-height: 1; }
          .stat-label { font-size: 0.75rem; color: #64748b; margin-top: 2px; }

          .schools-search-bar {
            position: relative; margin-bottom: 1.5rem;
          }
          .search-icon {
            position: absolute; left: 1rem; top: 50%; transform: translateY(-50%);
            color: #64748b;
          }
          .schools-search-input {
            width: 100%; padding: 0.75rem 1rem 0.75rem 2.75rem;
            background: #ffffff; border: 1px solid #e2e8f0;
            border-radius: 10px; color: #0f172a; font-size: 0.95rem;
            outline: none; transition: border-color 0.2s;
            box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          }
          .schools-search-input:focus { border-color: #1d4ed8; }

          .schools-loading {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem;
          }
          .school-card-skeleton {
            height: 230px; background: #ffffff; border-radius: 14px;
            border: 1px solid #e2e8f0;
            background: linear-gradient(90deg, #ffffff 25%, #f1f5f9 50%, #ffffff 75%);
            background-size: 200% 100%; animation: shimmer 1.5s infinite;
          }
          @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

          .schools-empty {
            text-align: center; padding: 4rem 2rem;
            background: #ffffff; border: 1px solid #e2e8f0;
            border-radius: 16px;
          }
          .empty-icon { color: #94a3b8; margin-bottom: 1rem; opacity: 0.7; }
          .schools-empty h3 { font-size: 1.2rem; color: #0f172a; margin-bottom: 0.5rem; }
          .schools-empty p { color: #64748b; margin-bottom: 1.5rem; }

          .schools-grid {
            display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.25rem;
          }
          .school-card {
            background: #ffffff; border: 1px solid #e2e8f0;
            border-radius: 14px; padding: 1.35rem;
            transition: transform 0.2s, box-shadow 0.2s;
            display: flex; flex-direction: column; gap: 0.75rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          }
          .school-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.08); }
          .school-card--inactive { opacity: 0.65; }

          .school-card-header { display: flex; align-items: center; justify-content: space-between; }
          .school-badge {
            background: linear-gradient(135deg, #1d4ed8, #8b5cf6);
            color: white; padding: 0.2rem 0.65rem; border-radius: 6px;
            font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em;
          }
          .school-card-actions { display: flex; gap: 0.35rem; }
          .school-action-btn {
            width: 30px; height: 30px; border: 1px solid #e2e8f0;
            background: #ffffff; border-radius: 7px; cursor: pointer; color: #64748b;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.15s;
          }
          .school-action-btn:hover { background: #f8fafc; color: #0f172a; }
          .school-action-danger:hover { background: rgba(239,68,68,0.1); color: #ef4444; border-color: #ef4444; }

          .school-name { font-size: 1.05rem; font-weight: 700; color: #0f172a; margin: 0; }

          .school-meta { display: flex; flex-direction: column; gap: 0.3rem; }
          .school-meta-item {
            display: flex; align-items: center; gap: 0.4rem;
            font-size: 0.8rem; color: #64748b;
          }

          .school-stats-row {
            display: flex; gap: 1rem; flex-wrap: wrap;
            padding: 0.75rem 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;
          }
          .school-stat {
            display: flex; align-items: center; gap: 0.35rem;
            font-size: 0.8rem; color: #64748b;
          }

          .school-status-row { display: flex; align-items: center; justify-content: space-between; }
          .school-status {
            display: flex; align-items: center; gap: 0.3rem;
            font-size: 0.78rem; font-weight: 600; padding: 0.2rem 0.6rem;
            border-radius: 20px;
          }
          .school-status--active { background: rgba(16,185,129,0.1); color: #10b981; }
          .school-status--inactive { background: rgba(239,68,68,0.1); color: #ef4444; }
          .school-manage-link {
            display: flex; align-items: center; gap: 0.2rem;
            font-size: 0.85rem; font-weight: 600; color: #1d4ed8;
            text-decoration: none; transition: gap 0.15s;
          }
          .school-manage-link:hover { gap: 0.4rem; }

          /* Modal - Solid, opaque and high contrast */
          .modal-overlay {
            position: fixed; inset: 0; background: rgba(15, 23, 42, 0.7);
            backdrop-filter: blur(8px); display: flex; align-items: center;
            justify-content: center; z-index: 1000; padding: 1.5rem;
          }
          .modal-box {
            background: #ffffff !important;
            border: 1px solid #e2e8f0;
            border-radius: 18px;
            width: 100%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0,0,0,0.05);
            animation: modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          }
          .school-modal { max-width: 640px; }
          @keyframes modalIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
          .modal-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 1.35rem 1.75rem; border-bottom: 1px solid #e2e8f0;
            background: #ffffff;
          }
          .modal-header h2 { font-size: 1.25rem; font-weight: 700; color: #0f172a; margin: 0; }
          .modal-close {
            background: #f1f5f9; border: none; color: #64748b; cursor: pointer;
            width: 32px; height: 32px; border-radius: 8px; display: flex;
            align-items: center; justify-content: center; font-size: 1rem;
            transition: all 0.15s;
          }
          .modal-close:hover { background: #e2e8f0; color: #0f172a; }
          .modal-error {
            margin: 1rem 1.75rem 0; padding: 0.75rem 1rem;
            background: rgba(239,68,68,0.1); color: #ef4444; border-radius: 8px; font-size: 0.875rem;
          }
          .modal-form {
            padding: 1.5rem 1.75rem; display: flex; flex-direction: column; gap: 1.15rem;
            background: #ffffff;
          }
          .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
          @media (max-width: 480px) { .form-row { grid-template-columns: 1fr; } }
          .form-group { display: flex; flex-direction: column; gap: 0.4rem; }
          .form-group label { font-size: 0.825rem; font-weight: 600; color: #334155; }
          .form-group input {
            padding: 0.7rem 0.95rem; background: #ffffff !important;
            border: 1.5px solid #cbd5e1; border-radius: 10px; color: #0f172a !important;
            font-size: 0.925rem; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
            box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          }
          .form-group input::placeholder { color: #94a3b8; }
          .form-group input:focus { border-color: #1d4ed8; box-shadow: 0 0 0 3px rgba(29, 78, 216,0.15); }
          .form-group input:disabled { background: #f8fafc !important; color: #94a3b8 !important; cursor: not-allowed; }
          .modal-footer {
            display: flex; justify-content: flex-end; gap: 0.75rem;
            padding: 1.25rem 1.75rem; border-top: 1px solid #e2e8f0;
            background: #f8fafc; border-radius: 0 0 18px 18px;
          }
          .btn-secondary {
            padding: 0.65rem 1.25rem; border: 1px solid #cbd5e1;
            background: #ffffff; border-radius: 10px; cursor: pointer; color: #334155;
            font-size: 0.9rem; font-weight: 600; transition: background 0.15s;
          }
          .btn-secondary:hover { background: #f1f5f9; }
          .btn-primary {
            padding: 0.65rem 1.4rem;
            background: linear-gradient(135deg, #1d4ed8, #8b5cf6);
            color: white; border: none; border-radius: 10px; cursor: pointer;
            font-size: 0.9rem; font-weight: 600; box-shadow: 0 4px 12px rgba(29, 78, 216,0.25);
            transition: opacity 0.15s;
          }
          .btn-primary:hover { opacity: 0.92; }
          .btn-primary:disabled { opacity: 0.65; cursor: not-allowed; }
        `}</style>
      </div>
    </AppLayout>
  );
}
