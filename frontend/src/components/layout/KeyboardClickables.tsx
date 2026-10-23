"use client";

import { useEffect } from "react";

// Many legacy pages render clickable <div>s (tabs, rows, toggles). This makes every element with an
// onClick-style role reachable by keyboard: it gets tabindex, a button role, and Enter/Space activate it.
const SELECTOR = ".tab, .sidebar-dropdown-trigger, .sidebar-lecture-row, .sidebar-section-header, .accordion-header, [data-clickable]";

export default function KeyboardClickables() {
  useEffect(() => {
    const enhance = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        if (el.tagName === "BUTTON" || el.tagName === "A" || el.dataset.kbd) return;
        el.dataset.kbd = "1";
        if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
        if (!el.hasAttribute("role")) el.setAttribute("role", "button");
        if (el.classList.contains("tab")) el.setAttribute("aria-selected", el.classList.contains("active") ? "true" : "false");
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.dataset?.kbd || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      el.click();
    };

    enhance(document);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) enhance(n.parentNode || n); });
        if (m.type === "attributes" && m.target instanceof HTMLElement && m.target.classList.contains("tab")) {
          m.target.setAttribute("aria-selected", m.target.classList.contains("active") ? "true" : "false");
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
