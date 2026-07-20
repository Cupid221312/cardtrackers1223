"use client";

import { useEditorStore } from "@/lib/store/editorStore";

/** High-contrast top title banner ("hook") rendered over the 9:16 canvas. */
export default function HookBannerOverlay({
  canvasHeight,
}: {
  canvasHeight: number;
}) {
  const banner = useEditorStore((s) => s.hookBanner);
  if (!banner.enabled || !banner.text.trim()) return null;

  const fontPx = Math.max(11, canvasHeight * 0.032);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-[7%]"
      style={{ top: `${banner.verticalPosition * 100}%` }}
    >
      <div
        className="font-caption max-w-full rounded-md px-[0.7em] py-[0.35em] text-center leading-snug"
        style={{
          backgroundColor: banner.bgColor,
          color: banner.textColor,
          fontSize: fontPx,
          fontWeight: 900,
          boxShadow: "0 4px 18px rgba(0,0,0,0.45)",
        }}
      >
        {banner.text}
      </div>
    </div>
  );
}
