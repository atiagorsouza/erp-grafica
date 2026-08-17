"use client";

import { type ReactNode, useState } from "react";

export function MobileSidebarOverlay({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  // Expose toggle function globally for TopBar hamburger
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__toggleMobileSidebar = () => setOpen((v) => !v);
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      {/* Sidebar drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[280px] transition-transform duration-200 lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div onClick={() => setOpen(false)}>
          {children}
        </div>
      </div>
    </>
  );
}
