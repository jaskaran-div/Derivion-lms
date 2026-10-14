"use client";

import { useState } from "react";
import { Link2, Share2 } from "lucide-react";
import toast from "react-hot-toast";

interface CourseShareMenuProps {
  slug: string;
  title: string;
}

export default function CourseShareMenu({ slug, title }: CourseShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const courseUrl = isOpen && typeof window !== "undefined"
    ? `${window.location.origin}/courses/${encodeURIComponent(slug)}`
    : "";
  const shareText = `${title} - ${courseUrl}`;
  const encodedUrl = encodeURIComponent(courseUrl);
  const encodedText = encodeURIComponent(shareText);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(courseUrl);
      toast.success("Course link copied to clipboard.");
      setIsOpen(false);
    } catch {
      toast.error("Could not copy the course link.");
    }
  };

  const handleNativeShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({ title, text: `Explore this course: ${title}`, url: courseUrl });
      setIsOpen(false);
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast.error("Could not share this course.");
      }
    }
  };

  const shareOptions = [
    { label: "WhatsApp", href: `https://wa.me/?text=${encodedText}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: "X", href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodedUrl}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(title)}` },
    { label: "Email", href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}` },
  ];

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <Share2 size={14} /> Share
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label={`Share ${title}`}
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 6px)",
            right: 0,
            width: 190,
            padding: 6,
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            background: "white",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleCopyLink}
            style={menuItemStyle}
          >
            <Link2 size={14} /> Copy course link
          </button>
          {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
            <button type="button" role="menuitem" onClick={handleNativeShare} style={menuItemStyle}>
              <Share2 size={14} /> More sharing options
            </button>
          )}
          {shareOptions.map((option) => (
            <a
              key={option.label}
              role="menuitem"
              href={option.href}
              target={option.label === "Email" ? undefined : "_blank"}
              rel={option.label === "Email" ? undefined : "noopener noreferrer"}
              onClick={() => setIsOpen(false)}
              style={menuItemStyle}
            >
              {option.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const menuItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  padding: "9px 10px",
  border: 0,
  borderRadius: 6,
  background: "transparent",
  color: "var(--gray-700)",
  fontSize: 13,
  textAlign: "left" as const,
  textDecoration: "none",
  cursor: "pointer",
};
