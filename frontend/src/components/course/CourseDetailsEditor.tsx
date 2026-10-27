"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Film, ImagePlus, Plus, Save, X } from "lucide-react";
import { apiErrorMessage, coursesAPI } from "@/lib/api";

export interface EditableCourse {
  id: string;
  title: string;
  shortDesc?: string | null;
  description: string;
  categoryId: string;
  level: string;
  language: string;
  price: number | string;
  discountPrice?: number | string | null;
  isFree: boolean;
  emiEnabled: boolean;
  tags: string[];
  requirements: string[];
  objectives: string[];
  thumbnail?: string | null;
  previewVideo?: string | null;
}

const LEVELS = ["Beginner", "Intermediate", "Advanced", "All Levels"];
const LANGUAGES = ["English", "Hindi", "Marathi", "Tamil", "Telugu"];

const toForm = (c: EditableCourse) => ({
  title: c.title || "",
  shortDesc: c.shortDesc || "",
  description: c.description || "",
  categoryId: c.categoryId || "",
  level: c.level || "Beginner",
  language: c.language || "English",
  price: String(c.price ?? 0),
  discountPrice: c.discountPrice != null ? String(c.discountPrice) : "",
  isFree: Boolean(c.isFree),
  emiEnabled: Boolean(c.emiEnabled),
  tags: c.tags || [],
  requirements: c.requirements?.length ? c.requirements : [""],
  objectives: c.objectives?.length ? c.objectives : [""],
});

type Form = ReturnType<typeof toForm>;

// Editable list of short lines (requirements, learning outcomes)
function LineList({ label, placeholder, items, onChange }: { label: string; placeholder: string; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 8 }}>
            <input
              className="form-control"
              placeholder={placeholder}
              value={item}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label={`Remove ${label.toLowerCase()} line`}
              onClick={() => onChange(items.length > 1 ? items.filter((_, j) => j !== i) : [""])}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => onChange([...items, ""])}>
          <Plus size={14} /> Add line
        </button>
      </div>
    </div>
  );
}

/**
 * Edit every course detail after creation: basics, pricing, tags, requirements, outcomes, media.
 */
export default function CourseDetailsEditor({ course, onSaved }: { course: EditableCourse; onSaved: () => void }) {
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState<Form>(() => toForm(course));
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const thumbInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    coursesAPI.adminGetCategories().then((res) => setCategories(res.data.data)).catch(() => {});
  }, []);

  const initial = JSON.stringify(toForm(course));
  const dirty = JSON.stringify(form) !== initial;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) set("tags", [...form.tags, tag]);
    setTagInput("");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.title.trim().length < 5) return toast.error("Title must be at least 5 characters.");
    if (form.description.trim().length < 20) return toast.error("Description must be at least 20 characters.");
    if (!form.categoryId) return toast.error("Select a category.");
    const price = parseFloat(form.price);
    if (!form.isFree && (!Number.isFinite(price) || price < 0)) return toast.error("Enter a valid price.");
    if (form.discountPrice && parseFloat(form.discountPrice) > price) return toast.error("Discount price cannot be higher than the price.");

    setSaving(true);
    try {
      await coursesAPI.update(course.id, {
        title: form.title,
        shortDesc: form.shortDesc,
        description: form.description,
        categoryId: form.categoryId,
        level: form.level,
        language: form.language,
        isFree: form.isFree,
        price: form.isFree ? 0 : price,
        discountPrice: form.isFree || !form.discountPrice ? null : form.discountPrice,
        emiEnabled: form.isFree ? false : form.emiEnabled,
        tags: form.tags,
        requirements: form.requirements.map((r) => r.trim()).filter(Boolean),
        objectives: form.objectives.map((o) => o.trim()).filter(Boolean),
      });
      toast.success("Course details saved.");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to save course details."));
    } finally {
      setSaving(false);
    }
  };

  const uploadThumbnail = async (file: File) => {
    setUploadingThumb(true);
    try {
      await coursesAPI.uploadThumbnail(course.id, file);
      toast.success("Thumbnail updated.");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Thumbnail upload failed."));
    } finally {
      setUploadingThumb(false);
    }
  };

  const uploadPreview = async (file: File) => {
    setVideoProgress(0);
    try {
      await coursesAPI.uploadPreviewVideo(course.id, file, setVideoProgress);
      toast.success("Preview video updated.");
      onSaved();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Preview video upload failed."));
    } finally {
      setVideoProgress(null);
    }
  };

  // Reloading the course after a save resets the form to the saved values
  const [lastCourse, setLastCourse] = useState(course);
  if (course !== lastCourse) {
    setLastCourse(course);
    setForm(toForm(course));
  }

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header" style={{ cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <span className="card-title">Course Details</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--gray-500)" }}>
          {dirty && <span className="badge badge-warning">Unsaved changes</span>}
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </div>

      {open && (
        <form className="card-body" onSubmit={save}>
          <div className="course-edit-grid">
            <div>
              <div className="form-group">
                <label className="form-label required" htmlFor="ce-title">Course title</label>
                <input id="ce-title" className="form-control" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ce-short">Short description</label>
                <input id="ce-short" className="form-control" value={form.shortDesc} onChange={(e) => set("shortDesc", e.target.value)} maxLength={500} placeholder="One line shown on course cards" />
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="ce-desc">Full description</label>
                <textarea id="ce-desc" className="form-control" rows={6} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label className="form-label required" htmlFor="ce-cat">Category</label>
                  <select id="ce-cat" className="form-control" value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                    <option value="">Select…</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="ce-level">Level</label>
                  <select id="ce-level" className="form-control" value={form.level} onChange={(e) => set("level", e.target.value)}>
                    {[...new Set([...LEVELS, form.level])].map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="ce-lang">Language</label>
                  <select id="ce-lang" className="form-control" value={form.language} onChange={(e) => set("language", e.target.value)}>
                    {[...new Set([...LANGUAGES, form.language])].map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <LineList label="Requirements" placeholder="e.g. Basic maths" items={form.requirements} onChange={(v) => set("requirements", v)} />
              <LineList label="What learners will learn" placeholder="e.g. Read a candlestick chart" items={form.objectives} onChange={(v) => set("objectives", v)} />

              <div className="form-group">
                <label className="form-label" htmlFor="ce-tag">Tags</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: form.tags.length ? 8 : 0 }}>
                  {form.tags.map((t) => (
                    <span key={t} className="badge badge-blue" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {t}
                      <button type="button" aria-label={`Remove tag ${t}`} onClick={() => set("tags", form.tags.filter((x) => x !== t))} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit", display: "flex" }}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    id="ce-tag"
                    className="form-control"
                    placeholder="Add a tag and press Enter"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={addTag}>Add</button>
                </div>
              </div>
            </div>

            <div>
              <div className="form-group">
                <label className="form-label">Thumbnail</label>
                <div className="course-edit-media">
                  {course.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={course.thumbnail} alt="Course thumbnail" />
                  ) : (
                    <span>No thumbnail</span>
                  )}
                </div>
                <input ref={thumbInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadThumbnail(f); }} />
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} disabled={uploadingThumb} onClick={() => thumbInput.current?.click()}>
                  <ImagePlus size={14} /> {uploadingThumb ? "Uploading…" : course.thumbnail ? "Replace thumbnail" : "Upload thumbnail"}
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Preview video</label>
                <div style={{ fontSize: 13, color: "var(--gray-500)" }}>
                  {videoProgress !== null ? `Uploading… ${videoProgress}%` : course.previewVideo ? "A preview video is set." : "No preview video."}
                </div>
                <input ref={videoInput} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadPreview(f); }} />
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} disabled={videoProgress !== null} onClick={() => videoInput.current?.click()}>
                  <Film size={14} /> {course.previewVideo ? "Replace preview video" : "Upload preview video"}
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Pricing</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.isFree} onChange={(e) => set("isFree", e.target.checked)} style={{ accentColor: "var(--primary)" }} />
                  Free course
                </label>
                {!form.isFree && (
                  <>
                    <div className="grid-2">
                      <div>
                        <label className="form-label" htmlFor="ce-price" style={{ fontSize: 12 }}>Price (₹)</label>
                        <input id="ce-price" className="form-control" type="number" min={0} step="1" value={form.price} onChange={(e) => set("price", e.target.value)} />
                      </div>
                      <div>
                        <label className="form-label" htmlFor="ce-disc" style={{ fontSize: 12 }}>Discount price (₹)</label>
                        <input id="ce-disc" className="form-control" type="number" min={0} step="1" value={form.discountPrice} onChange={(e) => set("discountPrice", e.target.value)} placeholder="Optional" />
                      </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 10, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.emiEnabled} onChange={(e) => set("emiEnabled", e.target.checked)} style={{ accentColor: "var(--primary)" }} />
                      Enable EMI at checkout
                    </label>
                    <div className="form-hint">EMI availability depends on Razorpay and the buyer&apos;s eligibility.</div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border-color)", paddingTop: 16 }}>
            <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={() => setForm(toForm(course))}>Discard changes</button>
            <button type="submit" className="btn btn-primary" disabled={!dirty || saving}>
              <Save size={15} /> {saving ? "Saving…" : "Save details"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
