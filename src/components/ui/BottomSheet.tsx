"use client";

import { useEffect } from "react";
import clsx from "clsx";

/**
 * Mobile bottom sheet (roadmap §7): on a phone the side panels become sheets
 * that slide up over the preview rather than columns squeezed off-screen.
 *
 * Slides rather than pops — the spring easing is the same one the rest of the
 * app uses, so sheets feel like they belong to the same surface.
 */
export default function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Escape closes, matching the gallery and modals.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={clsx(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        role="dialog"
        aria-label={title}
        aria-hidden={!open}
        className={clsx(
          "panel fixed inset-x-0 bottom-0 z-40 flex max-h-[78dvh] flex-col rounded-b-none lg:hidden",
          open ? "translate-y-0" : "pointer-events-none translate-y-full",
        )}
        style={{
          transition: "transform 320ms var(--ease-spring)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
          <span className="panel-title">{title}</span>
          <button
            className="btn-ghost !px-2 !py-1 text-xs"
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            ✕
          </button>
        </div>
        {/* Grab handle, purely affordance — the scrim and ✕ do the closing. */}
        <div className="mx-auto mb-1 h-1 w-10 shrink-0 rounded-full bg-white/20" />
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">{children}</div>
      </div>
    </>
  );
}
