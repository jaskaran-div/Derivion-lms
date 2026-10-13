"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  CreditCard,
  Settings,
  LogOut,
  ChevronDown,
  GraduationCap,
  BarChart3,
  FolderOpen,
  Bell,
  Search,
  MessageSquare,
  Award,
  Tag,
  PlusCircle,
  ListOrdered,
  Shield,
  ChevronRight,
  PlayCircle,
  ShoppingCart,
  Home,
  BookMarked,
  Building2,
  Upload,
  ScrollText,
  TrendingUp,
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
    label: "Notifications",
    icon: <Bell size={18} />,
    href: "/admin/notifications",
  },
  {
    label: "Support Chat",
    icon: <MessageSquare size={18} />,
    href: "/admin/support",
  },
  {
    label: "Settings",
    icon: <Settings size={18} />,
    href: "/admin/settings",
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
  {
    label: "Settings",
    icon: <Settings size={18} />,
    href: "/settings",
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
    label: "Notifications",
    icon: <Bell size={18} />,
    href: "/teacher/notifications",
  },
  {
    label: "Support Chat",
    icon: <MessageSquare size={18} />,
    href: "/teacher/support",
  },
  {
    label: "Settings",
    icon: <Settings size={18} />,
    href: "/settings",
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAdmin, isTeacher } = useAuthStore();
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set());

  const nav = isAdmin() ? adminNav : isTeacher() ? teacherNav : studentNav;

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

  const getInitials = () => {
    if (!user) return "U";
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  };

  return (
    <aside
      className={`app-sidebar ${mobileOpen ? "open" : ""}`}
      style={{ zIndex: 100 }}
    >
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🎓</div>
        <div>
          <div className="sidebar-logo-text">Derivion</div>
          <div className="sidebar-logo-badge">
            {isAdmin() ? "Admin" : isTeacher() ? "Teacher" : "Learning"}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Menu</div>

        {nav.map((item) => (
          <div key={item.label}>
            {item.href ? (
              <Link href={item.href} onClick={onClose}>
                <div
                  className={`sidebar-nav-item ${
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href))
                      ? "active"
                      : ""
                  }`}
                >
                  <span className="sidebar-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="badge">{item.badge}</span>
                  )}
                </div>
              </Link>
            ) : (
              <>
                <div
                  className={`sidebar-nav-item sidebar-dropdown-trigger ${
                    openDropdowns.has(item.label) ? "open" : ""
                  }`}
                  onClick={() => toggleDropdown(item.label)}
                >
                  <span className="sidebar-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  <ChevronDown size={14} className="chevron" />
                </div>

                <div
                  className={`sidebar-dropdown-menu ${
                    openDropdowns.has(item.label) ? "open" : ""
                  }`}
                >
                  {item.children?.map((child) => (
                    <Link href={child.href} key={child.href} onClick={onClose}>
                      <div
                        className={`sidebar-dropdown-item ${
                          pathname === child.href ? "active" : ""
                        }`}
                      >
                        {child.icon}
                        {child.label}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}

        {/* Switch Portal (admin can go to student view) */}
        {isAdmin() && (
          <>
            <div className="sidebar-section-label" style={{ marginTop: 12 }}>
              Portals
            </div>
            <Link href="/courses">
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

      {/* User footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="avatar">{getInitials()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--gray-800)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.firstName} {user?.lastName}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--gray-400)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.email}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={handleLogout}
            title="Logout"
            style={{ flexShrink: 0 }}
          >
            <LogOut size={16} color="var(--gray-500)" />
          </button>
        </div>
      </div>
    </aside>
  );
}
