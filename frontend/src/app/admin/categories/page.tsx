"use client";

import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { coursesAPI } from "@/lib/api";
import toast from "react-hot-toast";
import { Plus, Edit, Trash2, X, Tag } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  _count: { courses: number };
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", icon: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCategories(); }, []);

  const fetchCategories = async () => {
    try {
      const res = await coursesAPI.getCategories();
      setCategories(res.data.data);
    } catch {
      toast.error("Failed to load categories.");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditId(null);
    setFormData({ name: "", description: "", icon: "" });
    setShowForm(true);
  };

  const openEdit = (cat: Category) => {
    setEditId(cat.id);
    setFormData({ name: cat.name, description: cat.description || "", icon: cat.icon || "" });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Category name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await coursesAPI.updateCategory(editId, formData);
        toast.success("Category updated!");
      } else {
        await coursesAPI.createCategory(formData);
        toast.success("Category created!");
      }
      setShowForm(false);
      fetchCategories();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save category.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string, courseCount: number) => {
    if (courseCount > 0) {
      toast.error(`Cannot delete "${name}". It has ${courseCount} course(s). Move or delete them first.`);
      return;
    }
    if (!confirm(`Delete category "${name}"?`)) return;
    try {
      await coursesAPI.deleteCategory(id);
      toast.success("Category deleted.");
      fetchCategories();
    } catch {
      toast.error("Failed to delete category.");
    }
  };

  const emojiOptions = ["📚", "💻", "🎨", "🧮", "🔬", "🎵", "🏃", "📷", "💼", "🌍", "🧠", "⚙️", "📊", "🎯", "✍️"];

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div>
          <h1 className="page-title">Course Categories</h1>
          <p className="page-subtitle">{categories.length} categories</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add Category
          </button>
        </div>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 24, border: "2px solid var(--primary-light)" }}>
          <div className="card-header">
            <span className="card-title">{editId ? "Edit Category" : "New Category"}</span>
            <button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="card-body">
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label required">Category Name</label>
                <input
                  className="form-control"
                  placeholder="e.g., Web Development"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Icon (Emoji)</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="form-control"
                    style={{ width: 80 }}
                    placeholder="📚"
                    value={formData.icon}
                    onChange={e => setFormData({ ...formData, icon: e.target.value })}
                    maxLength={2}
                  />
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
                    {emojiOptions.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: emoji })}
                        style={{
                          fontSize: 20,
                          background: formData.icon === emoji ? "var(--primary-50)" : "var(--gray-50)",
                          border: formData.icon === emoji ? "2px solid var(--primary)" : "2px solid transparent",
                          borderRadius: 8,
                          padding: "4px",
                          cursor: "pointer",
                          lineHeight: 1,
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Brief description of this category..."
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editId ? "Update Category" : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Categories Grid */}
      {loading ? (
        <div className="grid-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card" style={{ padding: 24 }}>
              <div className="skeleton" style={{ height: 44, width: 44, borderRadius: 12, marginBottom: 14 }} />
              <div className="skeleton" style={{ height: 18, width: "70%", marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 14, width: "50%" }} />
            </div>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Tag size={36} /></div>
          <div className="empty-state-title">No categories yet</div>
          <div className="empty-state-text">Create categories to organize your courses.</div>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Create First Category</button>
        </div>
      ) : (
        <div className="grid-3">
          {categories.map(cat => (
            <div
              key={cat.id}
              className="card"
              style={{ padding: 24, transition: "transform 0.2s, box-shadow 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "")}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: "var(--primary-50)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                  }}
                >
                  {cat.icon || "📚"}
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(cat)}>
                    <Edit size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => handleDelete(cat.id, cat.name, cat._count.courses)}
                    style={{ color: "var(--danger)" }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--gray-900)", marginBottom: 4 }}>
                {cat.name}
              </h3>
              {cat.description && (
                <p style={{ fontSize: 13, color: "var(--gray-500)", lineHeight: 1.5, marginBottom: 12 }}>
                  {cat.description}
                </p>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="badge badge-blue">{cat._count.courses} courses</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
