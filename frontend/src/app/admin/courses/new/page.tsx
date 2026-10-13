"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import { coursesAPI } from "@/lib/api";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import { ArrowLeft, Upload, Plus, X, ImageIcon, Video } from "lucide-react";

const schema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(20, "Description must be at least 20 characters"),
  shortDesc: z.string().optional(),
  categoryId: z.string().min(1, "Select a category"),
  price: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "Valid price required"),
  discountPrice: z.string().optional(),
  level: z.string().min(1, "Select a level"),
  language: z.string().min(1, "Language required"),
  isFree: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

interface Category {
  id: string;
  name: string;
}

export default function NewCoursePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<File | null>(null);
  const [previewVideoName, setPreviewVideoName] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [requirements, setRequirements] = useState<string[]>([""]);
  const [objectives, setObjectives] = useState<string[]>([""]);
  const [isFreeChecked, setIsFreeChecked] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { level: "Beginner", language: "English", price: "0" },
  });

  useEffect(() => {
    coursesAPI.getCategories().then((res) => {
      setCategories(res.data.data);
    });
  }, []);

  const handleThumbnailChange = (file: File) => {
    setThumbnail(file);
    setThumbnailPreview(URL.createObjectURL(file));
  };

  const handlePreviewVideoChange = (file: File) => {
    setPreviewVideo(file);
    setPreviewVideoName(file.name);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const payload = {
        ...data,
        price: parseFloat(data.price),
        discountPrice: data.discountPrice ? parseFloat(data.discountPrice) : undefined,
        isFree: isFreeChecked,
        tags,
        requirements: requirements.filter((r) => r.trim()),
        objectives: objectives.filter((o) => o.trim()),
      };

      const res = await coursesAPI.create(payload);
      const courseId = res.data.data.id;

      // Upload thumbnail if selected
      if (thumbnail) {
        try {
          await coursesAPI.uploadThumbnail(courseId, thumbnail);
        } catch (uploadErr: any) {
          console.error("Thumbnail upload failed:", uploadErr);
          toast.error("Course created, but thumbnail upload failed.");
        }
      }

      // Upload preview video if selected
      if (previewVideo) {
        try {
          await coursesAPI.uploadPreviewVideo(courseId, previewVideo);
        } catch (uploadErr: any) {
          console.error("Preview video upload failed:", uploadErr);
          toast.error("Course created, but preview video upload failed.");
        }
      }

      toast.success("Course created! Now add sections and lesson videos.");
      router.push(`/admin/courses/${courseId}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create course.");
    } finally {
      setLoading(false);
    }
  };

  const updateListItem = (list: string[], setList: (v: string[]) => void, index: number, value: string) => {
    const updated = [...list];
    updated[index] = value;
    setList(updated);
  };

  const addListItem = (list: string[], setList: (v: string[]) => void) => {
    setList([...list, ""]);
  };

  const removeListItem = (list: string[], setList: (v: string[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index));
  };

  return (
    <AppLayout requiredRole="ADMIN">
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-ghost btn-icon" onClick={() => router.back()}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title">Create New Course</h1>
            <p className="page-subtitle">Fill in the details to create a new course</p>
          </div>
        </div>
        <div className="page-actions">
          <button type="submit" form="course-form" className="btn btn-primary" disabled={loading}>
            {loading ? "Creating..." : "Create Course"}
          </button>
        </div>
      </div>

      <form id="course-form" onSubmit={handleSubmit(onSubmit)}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
          {/* Left - Main info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Course Information</span>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label required">Course Title</label>
                  <input
                    {...register("title")}
                    className={`form-control ${errors.title ? "error" : ""}`}
                    placeholder="e.g., Complete Web Development Bootcamp 2024"
                  />
                  {errors.title && <div className="form-error">{errors.title.message}</div>}
                </div>

                <div className="form-group">
                  <label className="form-label">Short Description</label>
                  <input
                    {...register("shortDesc")}
                    className="form-control"
                    placeholder="A brief one-line summary"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label required">Full Description</label>
                  <textarea
                    {...register("description")}
                    className={`form-control ${errors.description ? "error" : ""}`}
                    rows={5}
                    placeholder="Describe what students will learn, who this course is for..."
                  />
                  {errors.description && <div className="form-error">{errors.description.message}</div>}
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label required">Category</label>
                    <select {...register("categoryId")} className={`form-control ${errors.categoryId ? "error" : ""}`}>
                      <option value="">Select category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    {errors.categoryId && <div className="form-error">{errors.categoryId.message}</div>}
                  </div>

                  <div className="form-group">
                    <label className="form-label required">Level</label>
                    <select {...register("level")} className="form-control">
                      <option>Beginner</option>
                      <option>Intermediate</option>
                      <option>Advanced</option>
                      <option>All Levels</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Language</label>
                    <select {...register("language")} className="form-control">
                      <option>English</option>
                      <option>Hindi</option>
                      <option>Marathi</option>
                      <option>Tamil</option>
                      <option>Telugu</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="card">
              <div className="card-header"><span className="card-title">Tags</span></div>
              <div className="card-body">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        background: "var(--primary-50)",
                        color: "var(--primary-dark)",
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    >
                      {tag}
                      <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="form-control"
                    placeholder="Add a tag..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  />
                  <button type="button" className="btn btn-secondary" onClick={addTag}>
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Requirements */}
            <div className="card">
              <div className="card-header"><span className="card-title">Requirements</span></div>
              <div className="card-body">
                {requirements.map((req, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input
                      className="form-control"
                      placeholder={`Requirement ${i + 1}`}
                      value={req}
                      onChange={(e) => updateListItem(requirements, setRequirements, i, e.target.value)}
                    />
                    <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeListItem(requirements, setRequirements, i)}>
                      <X size={16} color="var(--danger)" />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addListItem(requirements, setRequirements)}>
                  <Plus size={14} /> Add Requirement
                </button>
              </div>
            </div>

            {/* Objectives */}
            <div className="card">
              <div className="card-header"><span className="card-title">Learning Objectives</span></div>
              <div className="card-body">
                {objectives.map((obj, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input
                      className="form-control"
                      placeholder={`What students will learn ${i + 1}`}
                      value={obj}
                      onChange={(e) => updateListItem(objectives, setObjectives, i, e.target.value)}
                    />
                    <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeListItem(objectives, setObjectives, i)}>
                      <X size={16} color="var(--danger)" />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addListItem(objectives, setObjectives)}>
                  <Plus size={14} /> Add Objective
                </button>
              </div>
            </div>
          </div>

          {/* Right - Thumbnail & Pricing */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Thumbnail */}
            <div className="card">
              <div className="card-header"><span className="card-title">Course Thumbnail</span></div>
              <div className="card-body">
                <div
                  className="dropzone"
                  onClick={() => document.getElementById("thumbnail-input")?.click()}
                  style={{ padding: 28 }}
                >
                  {thumbnailPreview ? (
                    <img
                      src={thumbnailPreview}
                      alt="Thumbnail preview"
                      style={{ width: "100%", borderRadius: 8, aspectRatio: "16/9", objectFit: "cover" }}
                    />
                  ) : (
                    <div>
                      <ImageIcon size={32} color="var(--gray-400)" style={{ margin: "0 auto 12px" }} />
                      <p style={{ fontSize: 14, color: "var(--gray-500)" }}>
                        Click to upload thumbnail
                      </p>
                      <p style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>
                        PNG, JPG up to 5MB. 16:9 ratio recommended.
                      </p>
                    </div>
                  )}
                </div>
                <input
                  id="thumbnail-input"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && handleThumbnailChange(e.target.files[0])}
                />
              </div>
            </div>

            {/* Course Intro / Preview Video */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Preview Video (Optional)</span>
              </div>
              <div className="card-body">
                <div
                  className="dropzone"
                  onClick={() => document.getElementById("preview-video-input")?.click()}
                  style={{ padding: 20 }}
                >
                  {previewVideoName ? (
                    <div style={{ textAlign: "center" }}>
                      <Video size={28} color="var(--primary)" style={{ margin: "0 auto 8px" }} />
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--gray-800)", wordBreak: "break-all" }}>
                        {previewVideoName}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 4 }}>
                        Click to change video
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Video size={28} color="var(--gray-400)" style={{ margin: "0 auto 8px" }} />
                      <p style={{ fontSize: 13, color: "var(--gray-600)", fontWeight: 500 }}>
                        Upload Course Promo/Intro Video
                      </p>
                      <p style={{ fontSize: 11, color: "var(--gray-400)", marginTop: 4 }}>
                        MP4, WebM (Free preview for landing page)
                      </p>
                    </div>
                  )}
                </div>
                <input
                  id="preview-video-input"
                  type="file"
                  accept="video/*"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && handlePreviewVideoChange(e.target.files[0])}
                />
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--gray-500)", background: "var(--gray-50)", padding: "8px 12px", borderRadius: 8 }}>
                  💡 <strong>Tip:</strong> Full course curriculum lesson videos are uploaded section-by-section in the next step.
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div className="card">
              <div className="card-header"><span className="card-title">Pricing</span></div>
              <div className="card-body">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, padding: "12px", background: "var(--gray-50)", borderRadius: 10 }}>
                  <input
                    type="checkbox"
                    id="isFree"
                    checked={isFreeChecked}
                    onChange={(e) => {
                      setIsFreeChecked(e.target.checked);
                      if (e.target.checked) setValue("price", "0");
                    }}
                    style={{ width: 16, height: 16, accentColor: "var(--primary)", cursor: "pointer" }}
                  />
                  <label htmlFor="isFree" style={{ fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                    This is a free course
                  </label>
                </div>

                {!isFreeChecked && (
                  <>
                    <div className="form-group">
                      <label className="form-label required">Price (₹)</label>
                      <div className="input-group">
                        <span className="input-group-icon" style={{ left: 14, fontSize: 14, fontWeight: 600 }}>₹</span>
                        <input
                          {...register("price")}
                          className={`form-control ${errors.price ? "error" : ""}`}
                          placeholder="999"
                          type="number"
                          min="0"
                          step="1"
                        />
                      </div>
                      {errors.price && <div className="form-error">{errors.price.message}</div>}
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Discount Price (₹)</label>
                      <div className="input-group">
                        <span className="input-group-icon" style={{ left: 14, fontSize: 14, fontWeight: 600 }}>₹</span>
                        <input
                          {...register("discountPrice")}
                          className="form-control"
                          placeholder="Optional"
                          type="number"
                          min="0"
                          step="1"
                        />
                      </div>
                      <div className="form-hint">Strike-through price shown to students</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading}>
              {loading ? "Creating..." : "Create Course"}
            </button>
          </div>
        </div>
      </form>
    </AppLayout>
  );
}
