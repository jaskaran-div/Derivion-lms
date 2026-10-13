import axios from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: 0,
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) {
          clearAuth();
          window.location.href = "/login";
          return Promise.reject(error);
        }

        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefresh } = data.data;
        localStorage.setItem("access_token", accessToken);
        localStorage.setItem("refresh_token", newRefresh);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        clearAuth();
        window.location.href = "/login";
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export const clearAuth = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
};

// ==================== AUTH ====================
export const authAPI = {
  login: (data: { email: string; password: string }) =>
    api.post("/auth/login", data),
  register: (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) => api.post("/auth/register", data),
  getMe: () => api.get("/auth/me"),
  updateProfile: (data: object) => api.put("/auth/me", data),
  changePassword: (data: {
    currentPassword: string;
    newPassword: string;
  }) => api.post("/auth/change-password", data),
  forgotPassword: (email: string) =>
    api.post("/auth/forgot-password", { email }),
  resetPassword: (data: { token: string; password: string }) =>
    api.post("/auth/reset-password", data),
};

// ==================== COURSES ====================
export const coursesAPI = {
  getAll: (params?: object) => api.get("/courses", { params }),
  getBySlug: (slug: string) => api.get(`/courses/${slug}`),
  // Admin
  adminGetAll: (params?: object) => api.get("/courses/admin/all", { params }),
  adminGetOne: (id: string) => api.get(`/courses/admin/${id}`),
  create: (data: object) => api.post("/courses/admin", data),
  update: (id: string, data: object) => api.put(`/courses/admin/${id}`, data),
  delete: (id: string) => api.delete(`/courses/admin/${id}`),
  togglePublish: (id: string) => api.post(`/courses/admin/${id}/publish`),
  uploadThumbnail: (id: string, file: File) => {
    const form = new FormData();
    form.append("thumbnail", file);
    return api.post(`/courses/admin/${id}/thumbnail`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  uploadPreviewVideo: (id: string, file: File, onProgress?: (p: number) => void) =>
    uploadFileDirectOrProxy({
      file,
      onProgress,
      init: () =>
        api.post(`/courses/admin/${id}/preview-video/multipart/init`, {
          fileName: file.name,
          contentType: file.type || "video/mp4",
          fileSize: file.size,
        }),
      complete: (payload) =>
        api.post(`/courses/admin/${id}/preview-video/multipart/complete`, payload),
      abort: (payload) =>
        api.post(`/courses/admin/${id}/preview-video/multipart/abort`, payload),
      proxy: () => {
        const form = new FormData();
        form.append("video", file);
        return api.post(`/courses/admin/${id}/preview-video`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 0,
          onUploadProgress: (e) => {
            if (onProgress && e.total) {
              onProgress(Math.min(90, Math.round((e.loaded / e.total) * 90)));
            }
          },
        });
      },
    }),
  // Categories
  getCategories: () => api.get("/courses/categories/all"),
  createCategory: (data: object) => api.post("/courses/categories", data),
  updateCategory: (id: string, data: object) =>
    api.put(`/courses/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/courses/categories/${id}`),
  // Sections
  createSection: (courseId: string, data: object) =>
    api.post(`/courses/admin/${courseId}/sections`, data),
  updateSection: (id: string, data: object) =>
    api.put(`/courses/admin/sections/${id}`, data),
  deleteSection: (id: string) => api.delete(`/courses/admin/sections/${id}`),
  // Contents
  createContent: (sectionId: string, data: object) =>
    api.post(`/courses/admin/sections/${sectionId}/contents`, data),
  updateContent: (id: string, data: object) =>
    api.put(`/courses/admin/contents/${id}`, data),
  deleteContent: (id: string) => api.delete(`/courses/admin/contents/${id}`),
  uploadVideo: (id: string, file: File, onProgress?: (p: number) => void) =>
    uploadFileDirectOrProxy({
      file,
      onProgress,
      init: () =>
        api.post(`/courses/admin/contents/${id}/multipart/init`, {
          fileName: file.name,
          contentType: file.type || "video/mp4",
          fileSize: file.size,
        }),
      complete: (payload) =>
        api.post(`/courses/admin/contents/${id}/multipart/complete`, {
          ...payload,
          fileSize: file.size,
          mimeType: file.type || "video/mp4",
        }),
      abort: (payload) =>
        api.post(`/courses/admin/contents/${id}/multipart/abort`, payload),
      proxy: () => {
        const form = new FormData();
        form.append("video", file);
        return api.post(`/courses/admin/contents/${id}/upload-video`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 0,
          onUploadProgress: (e) => {
            if (onProgress && e.total) {
              onProgress(Math.min(90, Math.round((e.loaded / e.total) * 90)));
            }
          },
        });
      },
    }),
  uploadDocument: (id: string, file: File) => {
    const form = new FormData();
    form.append("document", file);
    return api.post(`/courses/admin/contents/${id}/upload-doc`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  // Assessments
  createAssessment: (courseId: string, data: object) =>
    api.post(`/courses/admin/${courseId}/assessments`, data),
  updateAssessment: (id: string, data: object) =>
    api.put(`/courses/admin/assessments/${id}`, data),
  addQuestion: (assessmentId: string, data: object) =>
    api.post(`/courses/admin/assessments/${assessmentId}/questions`, data),
  updateQuestion: (id: string, data: object) =>
    api.put(`/courses/admin/questions/${id}`, data),
  deleteQuestion: (id: string) => api.delete(`/courses/admin/questions/${id}`),
  // Student
  getContent: (id: string) => api.get(`/courses/student/content/${id}`),
  updateProgress: (id: string, data: object) =>
    api.post(`/courses/student/content/${id}/progress`, data),
  syncDuration: (id: string, duration: number) =>
    api.post(`/courses/content/${id}/duration`, { duration }),
  getAssessment: (id: string) => api.get(`/courses/student/assessments/${id}`),
  submitAssessment: (id: string, data: object) =>
    api.post(`/courses/student/assessments/${id}/submit`, data),
};

// ==================== USERS ====================
export const usersAPI = {
  // Admin
  getAll: (params?: object) => api.get("/admin/users", { params }),
  getById: (id: string) => api.get(`/admin/users/${id}`),
  create: (data: object) => api.post("/admin/users", data),
  update: (id: string, data: object) => api.put(`/admin/users/${id}`, data),
  delete: (id: string) => api.delete(`/admin/users/${id}`),
  enrollUser: (userId: string, courseId: string) =>
    api.post(`/admin/users/${userId}/enroll`, { courseId }),
  getDashboard: () => api.get("/admin/dashboard"),
  getPayments: (params?: object) => api.get("/admin/payments", { params }),
  broadcastNotification: (data: object) =>
    api.post("/notifications/send", data),
  // Student
  getStudentDashboard: () => api.get("/student/dashboard"),
  getEnrollments: () => api.get("/student/enrollments"),
  getCourseProgress: (courseId: string) =>
    api.get(`/student/courses/${courseId}/progress`),
  getNotifications: () => api.get("/notifications"),
  getNotificationHistory: () => api.get("/notifications/history"),
  markNotificationRead: (id: string) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put("/notifications/read-all"),
  deleteNotification: (id: string) => api.delete(`/notifications/${id}`),
  getCertificates: () => api.get("/certificates"),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("avatar", file);
    return api.post("/profile/avatar", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  getPaymentHistory: () => api.get("/payments/history"),
};

// ==================== PAYMENTS ====================
export const paymentsAPI = {
  createOrder: (courseId: string) =>
    api.post("/payments/create-order", { courseId }),
  verifyPayment: (data: string | { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string; orderId?: string }) =>
    api.post("/payments/verify", typeof data === "string" ? { orderId: data } : data),
};

// ==================== FORUM ====================
export const forumAPI = {
  getPosts: (courseId: string, params?: object) =>
    api.get(`/courses/${courseId}/forum`, { params }),
  createPost: (courseId: string, data: object) =>
    api.post(`/courses/${courseId}/forum`, data),
  getPost: (postId: string) => api.get(`/forum/posts/${postId}`),
  addReply: (postId: string, content: string) =>
    api.post(`/forum/posts/${postId}/reply`, { content }),
};

export const teacherAPI = {
  dashboard: () => api.get("/teacher/dashboard"),
  listStudents: (params?: object) => api.get("/teacher/students", { params }),
  createStudent: (data: object) => api.post("/teacher/students", data),
  updateStudent: (id: string, data: object) => api.put(`/teacher/students/${id}`, data),
  deleteStudent: (id: string) => api.delete(`/teacher/students/${id}`),
  enrollStudent: (id: string, courseId: string) =>
    api.post(`/teacher/students/${id}/enroll`, { courseId }),
  listCourses: () => api.get("/teacher/courses"),
};

export const chatAPI = {
  searchUsers: (q: string) => api.get("/chat/users/search", { params: { q } }),
  getConversations: () => api.get("/chat/conversations"),
  startConversation: (data: { recipientId?: string; email?: string; username?: string }) =>
    api.post("/chat/conversations", data),
  getConversationMessages: (id: string) => api.get(`/chat/conversations/${id}/messages`),
  sendConversationMessage: (id: string, body: string) =>
    api.post(`/chat/conversations/${id}/messages`, { body }),
  getMyThread: () => api.get("/support/thread"),
  sendMyMessage: (body: string) => api.post("/support/thread", { body }),
  adminList: (params?: object) => api.get("/admin/support", { params }),
  adminGet: (id: string) => api.get(`/admin/support/${id}`),
  adminReply: (id: string, body: string) => api.post(`/admin/support/${id}/reply`, { body }),
  adminSetStatus: (id: string, status: string) => api.patch(`/admin/support/${id}`, { status }),
  adminResetPassword: (id: string) => api.post(`/admin/support/${id}/reset-password`),
};

// ==================== SCHOOLS ====================
export const schoolsAPI = {
  list: (params?: object) => api.get("/admin/schools", { params }),
  get: (id: string) => api.get(`/admin/schools/${id}`),
  create: (data: object) => api.post("/admin/schools", data),
  update: (id: string, data: object) => api.put(`/admin/schools/${id}`, data),
  delete: (id: string) => api.delete(`/admin/schools/${id}`),
  getAnalytics: (id: string, params?: object) => api.get(`/admin/schools/${id}/analytics`, { params }),
  // Academic years
  listAcademicYears: (schoolId: string) => api.get(`/admin/schools/${schoolId}/academic-years`),
  createAcademicYear: (schoolId: string, data: object) => api.post(`/admin/schools/${schoolId}/academic-years`, data),
  // Classes
  listClasses: (schoolId: string) => api.get(`/admin/schools/${schoolId}/classes`),
  createClass: (schoolId: string, data: object) => api.post(`/admin/schools/${schoolId}/classes`, data),
  updateClass: (id: string, data: object) => api.put(`/admin/classes/${id}`, data),
  // Teacher assignments
  assignTeacher: (classId: string, teacherId: string) => api.post(`/admin/classes/${classId}/teachers`, { teacherId }),
  removeTeacher: (classId: string, teacherId: string) => api.delete(`/admin/classes/${classId}/teachers/${teacherId}`),
  // Student batches
  listClassStudents: (classId: string) => api.get(`/admin/classes/${classId}/students`),
  addStudentToClass: (classId: string, studentId: string) => api.post(`/admin/classes/${classId}/students`, { studentId }),
  removeStudentFromClass: (classId: string, studentId: string) => api.delete(`/admin/classes/${classId}/students/${studentId}`),
  // Course assignments
  assignCourseToSchool: (schoolId: string, courseId: string) => api.post(`/admin/schools/${schoolId}/courses`, { courseId }),
  assignCourseToClass: (classId: string, courseId: string) => api.post(`/admin/classes/${classId}/courses`, { courseId }),
  // School Members
  listMembers: (schoolId: string, params?: object) => api.get(`/admin/schools/${schoolId}/members`, { params }),
  addMember: (schoolId: string, data: { userId?: string; email?: string; role?: string }) => api.post(`/admin/schools/${schoolId}/members`, data),
  removeMember: (schoolId: string, userId: string) => api.delete(`/admin/schools/${schoolId}/members/${userId}`),
};

// ==================== BULK IMPORT ====================
export const bulkImportAPI = {
  getTemplate: () => api.get("/teacher/students/import/template", { responseType: "blob" }),
  validate: (csvData: string) => api.post("/teacher/students/import/validate", { csvData }),
  import: (data: { csvData: string; schoolId?: string; classId?: string; courseIds?: string[] }) =>
    api.post("/teacher/students/import", data),
  listJobs: () => api.get("/teacher/students/import/jobs"),
  getJob: (id: string) => api.get(`/teacher/students/import/jobs/${id}`),
};

// ==================== ANALYTICS ====================
export const analyticsAPI = {
  getOverview: (params?: object) => api.get("/admin/analytics/overview", { params }),
  getCourses: (params?: object) => api.get("/admin/analytics/courses", { params }),
  getAtRisk: () => api.get("/admin/analytics/at-risk"),
  getClassReport: (classId: string) => api.get(`/admin/analytics/class-report/${classId}`),
  exportStudents: (params?: object) =>
    api.get("/admin/analytics/export/students", { params, responseType: "blob" }),
};

// ==================== AUDIT LOGS ====================
export const auditAPI = {
  list: (params?: object) => api.get("/admin/audit-logs", { params }),
};

// ==================== CERTIFICATE VERIFICATION ====================
export const certificateAPI = {
  verify: (id: string) => api.get(`/courses/verify/${id}`),
};


type DirectInit = {
  mode: "direct" | "proxy";
  uploadId?: string;
  key?: string;
  partSize?: number;
  partUrls?: string[];
};

async function uploadParts(
  file: File,
  partSize: number,
  partUrls: string[],
  onProgress?: (p: number) => void
) {
  const parts: { ETag: string; PartNumber: number }[] = new Array(partUrls.length);
  let uploaded = 0;
  const concurrency = 4;
  let next = 0;

  const worker = async () => {
    while (next < partUrls.length) {
      const index = next++;
      const start = index * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);
      const res = await fetch(partUrls[index], { method: "PUT", body: blob });
      if (!res.ok) {
        throw new Error(`S3 part ${index + 1} failed (${res.status})`);
      }
      const etag = res.headers.get("ETag") || res.headers.get("etag");
      if (!etag) throw new Error("S3 did not return an ETag. Check bucket CORS ExposeHeaders.");
      parts[index] = { ETag: etag, PartNumber: index + 1 };
      uploaded += blob.size;
      if (onProgress) onProgress(Math.min(96, Math.round((uploaded / file.size) * 96)));
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, partUrls.length) }, () => worker()));
  return parts;
}

async function uploadFileDirectOrProxy({
  file,
  onProgress,
  init,
  complete,
  abort,
  proxy,
}: {
  file: File;
  onProgress?: (p: number) => void;
  init: () => Promise<{ data: { data: DirectInit } }>;
  complete: (payload: { uploadId: string; key: string; parts: { ETag: string; PartNumber: number }[] }) => Promise<unknown>;
  abort: (payload: { uploadId: string; key: string }) => Promise<unknown>;
  proxy: () => Promise<unknown>;
}) {
  const started = await init();
  const info = started.data.data;
  if (info.mode !== "direct" || !info.uploadId || !info.key || !info.partUrls?.length) {
    const result = await proxy();
    onProgress?.(100);
    return result;
  }

  try {
    onProgress?.(1);
    const parts = await uploadParts(file, info.partSize || 8 * 1024 * 1024, info.partUrls, onProgress);
    onProgress?.(98);
    const result = await complete({ uploadId: info.uploadId, key: info.key, parts });
    onProgress?.(100);
    return result;
  } catch {
    await abort({ uploadId: info.uploadId, key: info.key }).catch(() => {});
    onProgress?.(5);
    const result = await proxy();
    onProgress?.(100);
    return result;
  }
}

export default api;
