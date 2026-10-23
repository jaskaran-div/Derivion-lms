"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AppLayout from "@/components/layout/AppLayout";
import { schoolsAPI, coursesAPI, usersAPI, apiErrorMessage } from "@/lib/api";
import toast from "react-hot-toast";
import "./school-detail.css";
import {
  Building2, ArrowLeft, Plus, Users, BookOpen, Layers, Calendar, MapPin, Phone, Mail, Award, CheckCircle, XCircle, Edit, Trash2, UserPlus, ChevronRight, BarChart2, Download, Search, GraduationCap, Upload,
} from "lucide-react";

interface Teacher {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface ClassItem {
  id: string;
  name: string;
  section?: string | null;
  teacherId?: string | null;
  academicYearId?: string | null;
  teacher?: Teacher | null;
  academicYear?: { name: string } | null;
  teacherAssignments?: { teacher: Teacher }[];
  _count: { studentBatches: number };
}

interface CourseAssignment {
  id: string;
  courseId: string;
  course: {
    id: string;
    title: string;
    thumbnail?: string | null;
    status: string;
  };
}

interface SchoolMember {
  id: string;
  schoolId: string;
  userId: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  isActive: boolean;
  joinedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatar?: string | null;
    role: string;
    isActive: boolean;
    createdAt: string;
    studentBatches?: { class: { id: string; name: string; section?: string | null } }[];
    teacherAssignments?: { class: { id: string; name: string; section?: string | null } }[];
  };
}

interface SchoolDetail {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  academicYears: AcademicYear[];
  classes: ClassItem[];
  courseAssignments: CourseAssignment[];
  _count: { memberships: number; classes: number; importJobs: number };
}

interface AnalyticsSummary {
  totalStudents: number;
  activeStudents: number;
  totalEnrollments: number;
  completedEnrollments: number;
  completionRate: string | number;
  avgAssessmentScore: string | number;
  totalAttempts: number;
  notStartedCount: number;
}

interface ClassStudentRow {
  id: string;
  student?: { id: string; email: string; firstName: string; lastName: string; username?: string | null; isActive: boolean } | null;
}

export default function SchoolManagePage() {
  const params = useParams();
  const schoolId = params?.id as string;

  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"members" | "classes" | "years" | "courses" | "analytics">("members");

  // Members state
  const [members, setMembers] = useState<SchoolMember[]>([]);
  const [memberRoleFilter, setMemberRoleFilter] = useState<"ALL" | "STUDENT" | "TEACHER" | "ADMIN">("ALL");
  const [memberSearch, setMemberSearch] = useState("");
  // Members are "loading" until the list for the current filters has arrived
  const membersKey = `${memberRoleFilter}|${memberSearch.trim()}`;
  const [membersLoadedKey, setMembersLoadedKey] = useState<string | null>(null);
  const loadingMembers = membersLoadedKey !== membersKey;
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberForm, setAddMemberForm] = useState({ email: "", role: "STUDENT" });
  const [addingMember, setAddingMember] = useState(false);

  // Auxiliary data
  const [availableTeachers, setAvailableTeachers] = useState<Teacher[]>([]);
  const [availableCourses, setAvailableCourses] = useState<{ id: string; title: string }[]>([]);

  // Modals state
  const [showEditSchool, setShowEditSchool] = useState(false);
  const [schoolForm, setSchoolForm] = useState({
    name: "", address: "", city: "", state: "", pincode: "", phone: "", email: "", isActive: true,
  });

  const [showAddClass, setShowAddClass] = useState(false);
  const [classForm, setClassForm] = useState({
    name: "", section: "", teacherId: "", academicYearId: "",
  });

  const [showAddYear, setShowAddYear] = useState(false);
  const [yearForm, setYearForm] = useState({
    name: "", startDate: "", endDate: "",
  });

  const [showAssignCourse, setShowAssignCourse] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState("");

  // Class detail modal
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [classStudents, setClassStudents] = useState<ClassStudentRow[]>([]);
  const [loadingClassStudents, setLoadingClassStudents] = useState(false);
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignClassCourseId, setAssignClassCourseId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");



  const loadSchool = () =>
    Promise.all([
      schoolsAPI.get(schoolId),
      schoolsAPI.getAnalytics(schoolId).catch(() => ({ data: { data: { summary: null } } })),
    ])
      .then(([schoolRes, analyticsRes]) => {
      const sc = schoolRes.data.data;
      setSchool(sc);
      setSchoolForm({
        name: sc.name || "",
        address: sc.address || "",
        city: sc.city || "",
        state: sc.state || "",
        pincode: sc.pincode || "",
        phone: sc.phone || "",
        email: sc.email || "",
        isActive: sc.isActive ?? true,
      });

      if (analyticsRes.data?.data?.summary) {
        setAnalytics(analyticsRes.data.data.summary);
      }
      })
      .catch((err) => {
        console.error("Failed to load school:", err);
        setErrorMsg(apiErrorMessage(err, "Failed to load school details."));
      })
      .finally(() => setLoading(false));

  const loadAuxiliaryData = () =>
    Promise.all([
      usersAPI.getAll({ role: "TEACHER", limit: 100 }),
      coursesAPI.adminGetAll({ limit: 100 }),
    ])
      .then(([teachersRes, coursesRes]) => {
        setAvailableTeachers(teachersRes.data?.data?.users || []);
        setAvailableCourses(coursesRes.data?.data?.courses || []);
      })
      .catch((err) => console.error("Failed to load auxiliary data:", err));

  const loadMembers = () => {
    if (!schoolId) return Promise.resolve();
    const key = membersKey;
    return schoolsAPI
      .listMembers(schoolId, {
        role: memberRoleFilter !== "ALL" ? memberRoleFilter : undefined,
        search: memberSearch.trim() || undefined,
        limit: 100,
      })
      .then((res) => setMembers(res.data?.data?.members || []))
      .catch((err) => console.error("Failed to load school members:", err))
      .finally(() => setMembersLoadedKey(key));
  };

  useEffect(() => {
    if (schoolId) {
      loadSchool();
      loadAuxiliaryData();
    }
  }, [schoolId]);

  useEffect(() => {
    loadMembers();
  }, [schoolId, memberRoleFilter, memberSearch]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMemberForm.email.trim()) return;
    setAddingMember(true);
    setErrorMsg("");
    try {
      await schoolsAPI.addMember(schoolId, {
        email: addMemberForm.email.trim(),
        role: addMemberForm.role,
      });
      setShowAddMember(false);
      setAddMemberForm({ email: "", role: "STUDENT" });
      loadMembers();
      loadSchool();
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, "Failed to add member to school."));
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string, memberName: string) => {
    if (!confirm(`Are you sure you want to remove ${memberName} from this school?`)) return;
    try {
      await schoolsAPI.removeMember(schoolId, userId);
      loadMembers();
      loadSchool();
    } catch (err) {
      alert(apiErrorMessage(err, "Failed to remove member."));
    }
  };

  const handleUpdateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    try {
      await schoolsAPI.update(schoolId, schoolForm);
      setShowEditSchool(false);
      loadSchool();
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, "Failed to update school."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classForm.name.trim()) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await schoolsAPI.createClass(schoolId, {
        name: classForm.name.trim(),
        section: classForm.section.trim() || undefined,
        teacherId: classForm.teacherId || undefined,
        academicYearId: classForm.academicYearId || undefined,
      });
      setShowAddClass(false);
      setClassForm({ name: "", section: "", teacherId: "", academicYearId: "" });
      loadSchool();
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, "Failed to create class."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yearForm.name.trim() || !yearForm.startDate || !yearForm.endDate) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await schoolsAPI.createAcademicYear(schoolId, yearForm);
      setShowAddYear(false);
      setYearForm({ name: "", startDate: "", endDate: "" });
      loadSchool();
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, "Failed to add academic year."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignCourseToSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await schoolsAPI.assignCourseToSchool(schoolId, selectedCourseId);
      setShowAssignCourse(false);
      setSelectedCourseId("");
      loadSchool();
    } catch (err) {
      setErrorMsg(apiErrorMessage(err, "Failed to assign course."));
    } finally {
      setSubmitting(false);
    }
  };

  // Class detail viewer
  const openClassDetail = async (cls: ClassItem) => {
    setSelectedClass(cls);
    setLoadingClassStudents(true);
    try {
      const res = await schoolsAPI.listClassStudents(cls.id);
      setClassStudents(res.data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingClassStudents(false);
    }
  };

  const handleAddStudentToClass = async () => {
    if (!selectedClass || !assignStudentId.trim()) return;
    try {
      await schoolsAPI.addStudentToClass(selectedClass.id, assignStudentId.trim());
      setAssignStudentId("");
      openClassDetail(selectedClass);
      loadSchool();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Failed to add student to class."));
    }
  };

  const handleRemoveStudentFromClass = async (studentId: string) => {
    if (!selectedClass) return;
    if (!confirm("Remove this student from the class?")) return;
    try {
      await schoolsAPI.removeStudentFromClass(selectedClass.id, studentId);
      openClassDetail(selectedClass);
      loadSchool();
    } catch (err) {
      alert(apiErrorMessage(err, "Failed to remove student."));
    }
  };

  const handleAssignCourseToClass = async () => {
    if (!selectedClass || !assignClassCourseId) return;
    try {
      await schoolsAPI.assignCourseToClass(selectedClass.id, assignClassCourseId);
      setAssignClassCourseId("");
      alert("Course successfully assigned to class!");
    } catch (err) {
      alert(apiErrorMessage(err, "Failed to assign course to class."));
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="school-detail-container">
          <div className="school-loading-state">
            <div className="spinner" />
            <p>Loading school data...</p>
          </div>
          <style jsx>{`
            .school-detail-container { padding: 2rem; max-width: 1200px; margin: 0 auto; }
            .school-loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 400px; gap: 1rem; color: var(--text-secondary); }
            .spinner { width: 36px; height: 36px; border: 3px solid rgba(29, 78, 216,0.2); border-top-color: #1d4ed8; border-radius: 50%; animation: spin 0.8s linear infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      </AppLayout>
    );
  }

  if (!school) {
    return (
      <AppLayout>
        <div className="school-detail-container">
          <div className="error-box">
            <Building2 size={48} className="empty-icon" />
            <h2>School Not Found</h2>
            <p>{errorMsg || "The requested school does not exist or has been removed."}</p>
            <Link href="/admin/schools" className="btn-primary">
              <ArrowLeft size={16} /> Return to Schools List
            </Link>
          </div>
          <style jsx>{`
            .school-detail-container { padding: 2rem; max-width: 800px; margin: 0 auto; }
            .error-box { text-align: center; padding: 4rem 2rem; background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; display: flex; flex-direction: column; align-items: center; gap: 1rem; }
            .empty-icon { color: #ef4444; }
            .btn-primary { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.5rem; background: #1d4ed8; color: white; border-radius: 9px; text-decoration: none; font-weight: 600; margin-top: 1rem; }
          `}</style>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="school-manage-page">
        {/* Navigation Breadcrumb */}
        <div className="breadcrumb-row">
          <Link href="/admin/schools" className="back-link">
            <ArrowLeft size={16} /> Back to Schools
          </Link>
        </div>

        {/* Hero School Header */}
        <div className="school-hero-card">
          <div className="hero-main">
            <div className="school-avatar">
              <Building2 size={32} />
            </div>
            <div className="school-hero-info">
              <div className="school-tag-row">
                <span className="school-code-badge">{school.code}</span>
                <span className={`status-pill ${school.isActive ? "status-pill--active" : "status-pill--inactive"}`}>
                  {school.isActive ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {school.isActive ? "Active Institution" : "Inactive"}
                </span>
              </div>
              <h1 className="school-title">{school.name}</h1>
              <div className="school-contact-row">
                {(school.city || school.state) && (
                  <span className="contact-item">
                    <MapPin size={14} />
                    {[school.address, school.city, school.state, school.pincode].filter(Boolean).join(", ")}
                  </span>
                )}
                {school.phone && (
                  <span className="contact-item">
                    <Phone size={14} />
                    {school.phone}
                  </span>
                )}
                {school.email && (
                  <span className="contact-item">
                    <Mail size={14} />
                    {school.email}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="hero-actions">
            <button className="btn-secondary" onClick={() => setShowEditSchool(true)}>
              <Edit size={14} /> Edit School
            </button>
            <Link href={`/admin/import?schoolId=${school.id}`} className="btn-import">
              <Upload size={14} /> Bulk Import Students
            </Link>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon metric-indigo"><Users size={22} /></div>
            <div>
              <div className="metric-value">{analytics?.totalStudents ?? school._count.memberships}</div>
              <div className="metric-label">Enrolled Students</div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon metric-purple"><Layers size={22} /></div>
            <div>
              <div className="metric-value">{school.classes.length}</div>
              <div className="metric-label">Active Classes</div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon metric-blue"><BookOpen size={22} /></div>
            <div>
              <div className="metric-value">{school.courseAssignments.length}</div>
              <div className="metric-label">Assigned Courses</div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon metric-emerald"><Award size={22} /></div>
            <div>
              <div className="metric-value">{analytics?.completionRate ? `${analytics.completionRate}%` : "0%"}</div>
              <div className="metric-label">Avg. Completion Rate</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tabs-header">
          <button
            className={`tab-btn ${activeTab === "members" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("members")}
          >
            <Users size={16} /> Members ({school._count?.memberships || members.length})
          </button>
          <button
            className={`tab-btn ${activeTab === "classes" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("classes")}
          >
            <Layers size={16} /> Classes & Sections ({school.classes.length})
          </button>
          <button
            className={`tab-btn ${activeTab === "years" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("years")}
          >
            <Calendar size={16} /> Academic Years ({school.academicYears.length})
          </button>
          <button
            className={`tab-btn ${activeTab === "courses" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("courses")}
          >
            <BookOpen size={16} /> Assigned Courses ({school.courseAssignments.length})
          </button>
          <button
            className={`tab-btn ${activeTab === "analytics" ? "tab-btn--active" : ""}`}
            onClick={() => setActiveTab("analytics")}
          >
            <BarChart2 size={16} /> Performance Analytics
          </button>
        </div>

        {/* Tab 0: Members */}
        {activeTab === "members" && (
          <div className="tab-pane">
            <div className="pane-header">
              <div>
                <h2>School Members</h2>
                <p>All students, teachers, and administrators affiliated with {school.name}</p>
              </div>
              <div className="members-header-actions">
                <Link href={`/admin/import?schoolId=${school.id}`} className="btn-import">
                  <Upload size={14} /> Bulk Import CSV
                </Link>
                <button className="btn-primary" onClick={() => setShowAddMember(true)}>
                  <Plus size={15} /> Add Member
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="members-filter-bar">
              <div className="member-search-box">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
                {memberSearch && (
                  <button className="clear-search" onClick={() => setMemberSearch("")}>✕</button>
                )}
              </div>

              <div className="role-filter-group">
                {(["ALL", "STUDENT", "TEACHER", "ADMIN"] as const).map((r) => (
                  <button
                    key={r}
                    className={`role-filter-pill ${memberRoleFilter === r ? "role-filter-pill--active" : ""}`}
                    onClick={() => setMemberRoleFilter(r)}
                  >
                    {r === "ALL" ? "All Roles" : r === "STUDENT" ? "Students" : r === "TEACHER" ? "Teachers" : "Admins"}
                  </button>
                ))}
              </div>
            </div>

            {loadingMembers ? (
              <div className="empty-panel">
                <p>Loading members...</p>
              </div>
            ) : members.length === 0 ? (
              <div className="empty-panel">
                <Users size={40} className="empty-icon" />
                <h3>No members found</h3>
                <p>
                  {memberSearch || memberRoleFilter !== "ALL"
                    ? "No members match the current search filters."
                    : "There are currently no members enrolled in this school."}
                </p>
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                  <button className="btn-primary" onClick={() => setShowAddMember(true)}>
                    <Plus size={15} /> Add First Member
                  </button>
                  <Link href={`/admin/import?schoolId=${school.id}`} className="btn-import">
                    <Upload size={14} /> Bulk Import CSV
                  </Link>
                </div>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>School Role</th>
                      <th>Assigned Classes</th>
                      <th>Joined Date</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => {
                      const user = member.user;
                      const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
                      const initial = (user.firstName || user.email).charAt(0).toUpperCase();

                      // Classes info
                      const assignedClasses = user.studentBatches && user.studentBatches.length > 0
                        ? user.studentBatches.map(b => `${b.class.name}${b.class.section ? ` (${b.class.section})` : ""}`).join(", ")
                        : user.teacherAssignments && user.teacherAssignments.length > 0
                        ? user.teacherAssignments.map(a => `${a.class.name}${a.class.section ? ` (${a.class.section})` : ""}`).join(", ")
                        : "—";

                      return (
                        <tr key={member.id}>
                          <td>
                            <div className="member-profile-cell">
                              <div className={`member-avatar ${member.role === 'ADMIN' ? 'avatar-admin' : member.role === 'TEACHER' ? 'avatar-teacher' : 'avatar-student'}`}>
                                {user.avatar ? (
                                  <img src={user.avatar} alt={fullName} />
                                ) : (
                                  <span>{initial}</span>
                                )}
                              </div>
                              <div className="member-info">
                                <span className="member-name">{fullName}</span>
                                <span className="member-email">{user.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`member-role-badge badge-${member.role.toLowerCase()}`}>
                              {member.role === "ADMIN" ? "School Admin" : member.role === "TEACHER" ? "Teacher" : "Student"}
                            </span>
                          </td>
                          <td>
                            <span className="member-classes-text">{assignedClasses}</span>
                          </td>
                          <td>
                            <span className="member-date-text">
                              {new Date(member.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          </td>
                          <td>
                            <span className={`status-pill ${member.isActive ? "status-pill--active" : "status-pill--inactive"}`}>
                              {member.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              className="btn-danger-icon"
                              onClick={() => handleRemoveMember(user.id, fullName)}
                              title="Remove member from school"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 1: Classes & Sections */}
        {activeTab === "classes" && (
          <div className="tab-pane">
            <div className="pane-header">
              <div>
                <h2>Classes & Sections</h2>
                <p>Manage student cohorts, assign primary class teachers and curriculum</p>
              </div>
              <button className="btn-primary" onClick={() => setShowAddClass(true)}>
                <Plus size={16} /> Add Class
              </button>
            </div>

            {school.classes.length === 0 ? (
              <div className="empty-panel">
                <Layers size={40} className="empty-icon" />
                <h3>No classes created yet</h3>
                <p>Create grade classes or sections (e.g. Grade 10-A) to organize learners.</p>
                <button className="btn-primary" onClick={() => setShowAddClass(true)}>
                  <Plus size={15} /> Create First Class
                </button>
              </div>
            ) : (
              <div className="classes-grid">
                {school.classes.map((cls) => (
                  <div key={cls.id} className="class-card">
                    <div className="class-card-top">
                      <div>
                        <h3 className="class-title">
                          {cls.name} {cls.section ? `— Section ${cls.section}` : ""}
                        </h3>
                        {cls.academicYear && (
                          <span className="class-year-badge">{cls.academicYear.name}</span>
                        )}
                      </div>
                      <span className="student-count-badge">
                        <Users size={13} /> {cls._count.studentBatches} Students
                      </span>
                    </div>

                    <div className="class-teacher-info">
                      <GraduationCap size={15} className="teacher-icon" />
                      <span>
                        Teacher: {cls.teacher ? `${cls.teacher.firstName} ${cls.teacher.lastName}` : "Not assigned"}
                      </span>
                    </div>

                    <div className="class-card-actions">
                      <button className="btn-secondary btn-sm" onClick={() => openClassDetail(cls)}>
                        Manage Students & Courses <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Academic Years */}
        {activeTab === "years" && (
          <div className="tab-pane">
            <div className="pane-header">
              <div>
                <h2>Academic Years</h2>
                <p>Define institutional calendar years for grouping student cohorts</p>
              </div>
              <button className="btn-primary" onClick={() => setShowAddYear(true)}>
                <Plus size={16} /> Add Academic Year
              </button>
            </div>

            {school.academicYears.length === 0 ? (
              <div className="empty-panel">
                <Calendar size={40} className="empty-icon" />
                <h3>No academic years configured</h3>
                <p>Add an academic calendar year (e.g. 2025-26) to organize classes and terms.</p>
                <button className="btn-primary" onClick={() => setShowAddYear(true)}>
                  <Plus size={15} /> Add Academic Year
                </button>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Year Name</th>
                      <th>Start Date</th>
                      <th>End Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {school.academicYears.map((yr) => (
                      <tr key={yr.id}>
                        <td className="font-bold">{yr.name}</td>
                        <td>{new Date(yr.startDate).toLocaleDateString()}</td>
                        <td>{new Date(yr.endDate).toLocaleDateString()}</td>
                        <td>
                          <span className={`status-pill ${yr.isActive ? "status-pill--active" : "status-pill--inactive"}`}>
                            {yr.isActive ? "Active" : "Archived"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Assigned Courses */}
        {activeTab === "courses" && (
          <div className="tab-pane">
            <div className="pane-header">
              <div>
                <h2>Assigned Courses</h2>
                <p>Platform courses authorized for learners and teachers in this school</p>
              </div>
              <button className="btn-primary" onClick={() => setShowAssignCourse(true)}>
                <Plus size={16} /> Assign Course to School
              </button>
            </div>

            {school.courseAssignments.length === 0 ? (
              <div className="empty-panel">
                <BookOpen size={40} className="empty-icon" />
                <h3>No courses assigned to this school</h3>
                <p>Assign catalog courses to give this institution full access to lesson content.</p>
                <button className="btn-primary" onClick={() => setShowAssignCourse(true)}>
                  <Plus size={15} /> Assign First Course
                </button>
              </div>
            ) : (
              <div className="courses-grid">
                {school.courseAssignments.map((ca) => (
                  <div key={ca.id} className="course-card-mini">
                    <div className="course-mini-thumb">
                      {ca.course.thumbnail ? (
                        <img src={ca.course.thumbnail} alt={ca.course.title} />
                      ) : (
                        <div className="thumb-placeholder"><BookOpen size={24} /></div>
                      )}
                    </div>
                    <div className="course-mini-body">
                      <h4>{ca.course.title}</h4>
                      <span className="badge-published">{ca.course.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Performance Analytics */}
        {activeTab === "analytics" && (
          <div className="tab-pane">
            <div className="pane-header">
              <div>
                <h2>School Performance & Analytics</h2>
                <p>Institutional metrics, completion rates and learner progress</p>
              </div>
              <Link href={`/admin/analytics/export/students?schoolId=${school.id}`} className="btn-secondary">
                <Download size={15} /> Export School CSV
              </Link>
            </div>

            <div className="analytics-overview-cards">
              <div className="stat-box">
                <span className="stat-title">Total Registered Students</span>
                <span className="stat-num">{analytics?.totalStudents ?? school._count.memberships}</span>
              </div>
              <div className="stat-box">
                <span className="stat-title">Active Active Learners</span>
                <span className="stat-num">{analytics?.activeStudents ?? 0}</span>
              </div>
              <div className="stat-box">
                <span className="stat-title">Completed Course Enrollments</span>
                <span className="stat-num">{analytics?.completedEnrollments ?? 0}</span>
              </div>
              <div className="stat-box">
                <span className="stat-title">Average Assessment Score</span>
                <span className="stat-num">{analytics?.avgAssessmentScore ? `${analytics.avgAssessmentScore}%` : "N/A"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Edit School Details */}
        {showEditSchool && (
          <div className="modal-overlay" onClick={() => setShowEditSchool(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Edit School Details</h2>
                <button className="modal-close" onClick={() => setShowEditSchool(false)}>✕</button>
              </div>
              {errorMsg && <div className="modal-error">{errorMsg}</div>}
              <form onSubmit={handleUpdateSchool} className="modal-form">
                <div className="form-group">
                  <label>Institution Name *</label>
                  <input
                    value={schoolForm.name}
                    onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Contact Phone</label>
                    <input
                      value={schoolForm.phone}
                      onChange={(e) => setSchoolForm({ ...schoolForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Official Email</label>
                    <input
                      type="email"
                      value={schoolForm.email}
                      onChange={(e) => setSchoolForm({ ...schoolForm, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <input
                    value={schoolForm.address}
                    onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>City</label>
                    <input
                      value={schoolForm.city}
                      onChange={(e) => setSchoolForm({ ...schoolForm, city: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>State</label>
                    <input
                      value={schoolForm.state}
                      onChange={(e) => setSchoolForm({ ...schoolForm, state: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowEditSchool(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add Class */}
        {showAddClass && (
          <div className="modal-overlay" onClick={() => setShowAddClass(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add Class / Section</h2>
                <button className="modal-close" onClick={() => setShowAddClass(false)}>✕</button>
              </div>
              <form onSubmit={handleCreateClass} className="modal-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Class Name * (e.g. Grade 10, Class 8)</label>
                    <input
                      value={classForm.name}
                      onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                      placeholder="Grade 10"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Section (e.g. A, B, Science)</label>
                    <input
                      value={classForm.section}
                      onChange={(e) => setClassForm({ ...classForm, section: e.target.value })}
                      placeholder="A"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Primary Class Teacher</label>
                  <select
                    value={classForm.teacherId}
                    onChange={(e) => setClassForm({ ...classForm, teacherId: e.target.value })}
                  >
                    <option value="">-- Select Class Teacher --</option>
                    {availableTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName} ({t.email})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Academic Year</label>
                  <select
                    value={classForm.academicYearId}
                    onChange={(e) => setClassForm({ ...classForm, academicYearId: e.target.value })}
                  >
                    <option value="">-- Select Academic Year --</option>
                    {school.academicYears.map((yr) => (
                      <option key={yr.id} value={yr.id}>
                        {yr.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowAddClass(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? "Creating..." : "Create Class"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Add Academic Year */}
        {showAddYear && (
          <div className="modal-overlay" onClick={() => setShowAddYear(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add Academic Year</h2>
                <button className="modal-close" onClick={() => setShowAddYear(false)}>✕</button>
              </div>
              <form onSubmit={handleCreateYear} className="modal-form">
                <div className="form-group">
                  <label>Academic Year Name * (e.g. 2025-2026)</label>
                  <input
                    value={yearForm.name}
                    onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })}
                    placeholder="2025-2026"
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Start Date *</label>
                    <input
                      type="date"
                      value={yearForm.startDate}
                      onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>End Date *</label>
                    <input
                      type="date"
                      value={yearForm.endDate}
                      onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowAddYear(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? "Saving..." : "Add Year"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Assign Course */}
        {showAssignCourse && (
          <div className="modal-overlay" onClick={() => setShowAssignCourse(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Assign Course to School</h2>
                <button className="modal-close" onClick={() => setShowAssignCourse(false)}>✕</button>
              </div>
              <form onSubmit={handleAssignCourseToSchool} className="modal-form">
                <div className="form-group">
                  <label>Select Course from Catalog *</label>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose a Course --</option>
                    {availableCourses
                      .filter((c) => !school.courseAssignments.some((ca) => ca.courseId === c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                  </select>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowAssignCourse(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? "Assigning..." : "Assign Course"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Class Detail & Student Batch Management */}
        {selectedClass && (
          <div className="modal-overlay" onClick={() => setSelectedClass(null)}>
            <div className="modal-box class-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2>{selectedClass.name} {selectedClass.section ? `(Section ${selectedClass.section})` : ""}</h2>
                  <p className="modal-subtitle">
                    Class Teacher: {selectedClass.teacher ? `${selectedClass.teacher.firstName} ${selectedClass.teacher.lastName}` : "None"}
                  </p>
                </div>
                <button className="modal-close" onClick={() => setSelectedClass(null)}>✕</button>
              </div>

              <div className="class-detail-content">
                {/* Assign Course to Class Section */}
                <div className="section-card">
                  <h4>Assign Course to this Class</h4>
                  <div className="inline-action-form">
                    <select
                      value={assignClassCourseId}
                      onChange={(e) => setAssignClassCourseId(e.target.value)}
                    >
                      <option value="">-- Choose Course --</option>
                      {availableCourses.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                    <button className="btn-primary btn-sm" onClick={handleAssignCourseToClass}>
                      Assign to Class
                    </button>
                  </div>
                </div>

                {/* Enrolled Students in Class */}
                <div className="section-card">
                  <h4>Class Students ({classStudents.length})</h4>
                  {/* Add an existing student of this school to the class */}
                  {(() => {
                    const inClass = new Set(classStudents.map((b) => b.student?.id));
                    const candidates = members.filter((m) => m.role === "STUDENT" && !inClass.has(m.user.id));
                    return (
                      <div style={{ display: "flex", gap: 8, margin: "8px 0 14px", flexWrap: "wrap" }}>
                        <select
                          className="form-control"
                          style={{ flex: 1, minWidth: 200 }}
                          value={assignStudentId}
                          onChange={(e) => setAssignStudentId(e.target.value)}
                          aria-label="Student to add to this class"
                        >
                          <option value="">{candidates.length ? "Select a school student…" : "No other students in this school"}</option>
                          {candidates.map((m) => (
                            <option key={m.user.id} value={m.user.id}>
                              {`${m.user.firstName} ${m.user.lastName}`.trim() || m.user.email} ({m.user.email})
                            </option>
                          ))}
                        </select>
                        <button type="button" className="btn btn-primary btn-sm" disabled={!assignStudentId} onClick={handleAddStudentToClass}>
                          <UserPlus size={14} /> Add to class
                        </button>
                      </div>
                    );
                  })()}
                  {loadingClassStudents ? (
                    <p className="loading-text">Loading student batch...</p>
                  ) : classStudents.length === 0 ? (
                    <div className="empty-sub">
                      <p>No students enrolled in this class batch yet.</p>
                      <Link href={`/admin/import?schoolId=${school.id}&classId=${selectedClass.id}`} className="btn-secondary btn-sm">
                        <UserPlus size={14} /> Bulk Import to this Class
                      </Link>
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Student ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Active</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {classStudents.map((batch) => (
                            <tr key={batch.id}>
                              <td className="font-mono text-xs">{batch.student?.username || "—"}</td>
                              <td>{batch.student?.firstName} {batch.student?.lastName}</td>
                              <td>{batch.student?.email}</td>
                              <td>
                                <span className={`status-pill ${batch.student?.isActive ? "status-pill--active" : "status-pill--inactive"}`}>
                                  {batch.student?.isActive ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="btn-danger-icon"
                                  onClick={() => batch.student && handleRemoveStudentFromClass(batch.student.id)}
                                  title="Remove from class"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setSelectedClass(null)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Add School Member */}
        {showAddMember && (
          <div className="modal-overlay" onClick={() => setShowAddMember(false)}>
            <div className="modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2>Add School Member</h2>
                  <p className="modal-subtitle">Enroll a student, teacher, or administrator to {school.name}</p>
                </div>
                <button className="modal-close" onClick={() => setShowAddMember(false)}>✕</button>
              </div>
              <form onSubmit={handleAddMember} className="modal-form">
                <div className="form-group">
                  <label>User Email Address *</label>
                  <input
                    type="email"
                    value={addMemberForm.email}
                    onChange={(e) => setAddMemberForm({ ...addMemberForm, email: e.target.value })}
                    placeholder="student@school.edu or user@example.com"
                    required
                  />
                  <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    User must already have an account, or will be assigned to this school upon registering.
                  </span>
                </div>

                <div className="form-group">
                  <label>Institutional Role *</label>
                  <select
                    value={addMemberForm.role}
                    onChange={(e) => setAddMemberForm({ ...addMemberForm, role: e.target.value })}
                  >
                    <option value="STUDENT">Student</option>
                    <option value="TEACHER">Teacher</option>
                    <option value="ADMIN">School Administrator</option>
                  </select>
                </div>

                <div className="modal-footer">
                  <button type="button" className="btn-secondary" onClick={() => setShowAddMember(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary" disabled={addingMember}>
                    {addingMember ? "Adding Member..." : "Add to School"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
