"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import {
  LayoutDashboard, BookOpen, Users, CreditCard, Settings, LogOut, ChevronDown, GraduationCap, BarChart3, Bell, Search, MessageSquare, Award, Tag, PlusCircle, ListOrdered, Home, BookMarked, Building2, Upload, ScrollText, TrendingUp, Video, HelpCircle,
} from "lucide-react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  href?: string;
  children?: { label: string; href: string; icon?: React.ReactNode }[];
  badge?: number;
}

const adminNav: NavItem[] = [
  {
    label: "Dashboard",
    icon: <LayoutDashboard size={18} />,
    href: "/admin/dashboard",
  },
  {
    label: "Schools",
    icon: <Building2 size={18} />,
    children: [
      { label: "All Schools", href: "/admin/schools", icon: <Building2 size={14} /> },
      { label: "Bulk Import", href: "/admin/import", icon: <Upload size={14} /> },
    ],
  },
  {
    label: "Courses",
    icon: <BookOpen size={18} />,
    children: [
      { label: "All Courses", href: "/admin/courses", icon: <ListOrdered size={14} /> },
      { label: "Add Course", href: "/admin/courses/new", icon: <PlusCircle size={14} /> },
      { label: "Categories", href: "/admin/categories", icon: <Tag size={14} /> },
    ],
  },
  {
    label: "Quizzes",
    icon: <HelpCircle size={18} />,
    href: "/admin/quizzes",
  },
  {
    label: "Users",
    icon: <Users size={18} />,
    children: [
      { label: "All Users", href: "/admin/users", icon: <Users size={14} /> },
      { label: "Add User", href: "/admin/users/new", icon: <PlusCircle size={14} /> },
    ],
  },
  {
    label: "Payments",
    icon: <CreditCard size={18} />,
    href: "/admin/payments",
  },
  {
    label: "Analytics",
    icon: <BarChart3 size={18} />,
    children: [
      { label: "Overview", href: "/admin/analytics", icon: <TrendingUp size={14} /> },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: <ScrollText size={14} /> },
    ],
  },
  {
    label: "Mentors",
    icon: <Video size={18} />,
    href: "/admin/mentors",
  },
  {
    label: "Notifications",
    icon: <Bell size={18} />,
    href: "/admin/notifications",
  },
  {
    label: "Support Chat",
    icon: <MessageSquare size={18} />,
    href: "/admin/support",
  },
];

const studentNav: NavItem[] = [
  {
    label: "Dashboard",
    icon: <LayoutDashboard size={18} />,
    href: "/dashboard",
  },
  {
    label: "My Courses",
    icon: <BookMarked size={18} />,
    href: "/my-courses",
  },
  {
    label: "Browse Courses",
    icon: <Search size={18} />,
    href: "/courses",
  },
  {
    label: "Mentors",
    icon: <Video size={18} />,
    href: "/mentors",
  },
  {
    label: "Certificates",
    icon: <Award size={18} />,
    href: "/certificates",
  },
  {
    label: "Forum",
    icon: <MessageSquare size={18} />,
    href: "/forum",
  },
  {
    label: "Support Chat",
    icon: <MessageSquare size={18} />,
    href: "/support",
  },
  {
    label: "Payments",
    icon: <CreditCard size={18} />,
    href: "/payments",
  },
];

const teacherNav: NavItem[] = [
  {
    label: "Dashboard",
    icon: <LayoutDashboard size={18} />,
    href: "/teacher/dashboard",
  },
  {
    label: "Students",
    icon: <GraduationCap size={18} />,
    children: [
      { label: "My Students", href: "/teacher/students", icon: <Users size={14} /> },
      { label: "Bulk Import", href: "/teacher/import", icon: <Upload size={14} /> },
    ],
  },
  {
    label: "Mentors",
    icon: <Video size={18} />,
    href: "/teacher/mentors",
  },
  {
    label: "Notifications",
    icon: <Bell size={18} />,
    href: "/teacher/notifications",
  },
  {
    label: "Support Chat",
    icon: <MessageSquare size={18} />,
    href: "/teacher/support",
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, isAdmin, isTeacher } = useAuthStore();
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set());

  const nav = isAdmin() ? adminNav : isTeacher() ? teacherNav : studentNav;
  const isStudentRole = !isAdmin() && !isTeacher();

  // Auto-open dropdown if current path matches a child
  useEffect(() => {
    nav.forEach((item) => {
      if (item.children) {
        const match = item.children.some((c) => pathname.startsWith(c.href));
        if (match) {
          setOpenDropdowns((prev) => new Set([...prev, item.label]));
        }
      }
    });
  }, [pathname]);

  const toggleDropdown = (label: string) => {
    setOpenDropdowns((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  const settingsHref = isAdmin() ? "/admin/settings" : "/settings";

  return (
    <aside className={`app-sidebar ${mobileOpen ? "open" : ""}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <GraduationCap size={22} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="sidebar-logo-text">Derivion</div>
          {!isStudentRole && (
            <div className="sidebar-logo-badge">{isAdmin() ? "Admin" : "Teacher"}</div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Menu</div>

        {nav.map((item) => {
          const childActive = item.children?.some((c) => isActive(c.href));
          return (
            <div key={item.label}>
              {item.href ? (
                <Link href={item.href} onClick={onClose}>
                  <div className={`sidebar-nav-item ${isActive(item.href) ? "active" : ""}`}>
                    <span className="sidebar-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.badge && <span className="badge">{item.badge}</span>}
                  </div>
                </Link>
              ) : (
                <>
                  <div
                    className={`sidebar-nav-item sidebar-dropdown-trigger ${openDropdowns.has(item.label) ? "open" : ""} ${childActive ? "has-active" : ""}`}
                    onClick={() => toggleDropdown(item.label)}
                  >
                    <span className="sidebar-nav-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    <ChevronDown size={14} className="chevron" />
                  </div>

                  <div className={`sidebar-dropdown-menu ${openDropdowns.has(item.label) ? "open" : ""}`}>
                    {item.children?.map((child) => (
                      <Link href={child.href} key={child.href} onClick={onClose}>
                        <div className={`sidebar-dropdown-item ${pathname === child.href ? "active" : ""}`}>
                          {child.icon}
                          {child.label}
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* Switch Portal (admin can go to student view) */}
        {isAdmin() && (
          <>
            <div className="sidebar-section-label" style={{ marginTop: 8 }}>
              Portals
            </div>
            <Link href="/courses" onClick={onClose}>
              <div className="sidebar-nav-item">
                <span className="sidebar-nav-icon">
                  <Home size={18} />
                </span>
                <span>Student View</span>
              </div>
            </Link>
          </>
        )}
      </nav>

      {/* Footer: settings & logout */}
      <div className="sidebar-footer">
        <Link href={settingsHref} onClick={onClose}>
          <div className={`sidebar-nav-item plain ${isActive(settingsHref) ? "active" : ""}`}>
            <span className="sidebar-nav-icon"><Settings size={18} /></span>
            <span>Settings</span>
          </div>
        </Link>
        <div className="sidebar-nav-item plain" onClick={handleLogout} role="button">
          <span className="sidebar-nav-icon"><LogOut size={18} /></span>
          <span>Logout</span>
        </div>
      </div>
    </aside>
  );
}
