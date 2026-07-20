"use client";

import { useRef } from "react";
import { useEditorStore } from "@/lib/store/editorStore";
import { clamp } from "@/lib/time";

/** Draggable logo/watermark layer. Positions are stored as canvas fractions. */
export default function StickerLayer() {
  const stickers = useEditorStore((s) => s.stickers);
  const updateSticker = useEditorStore((s) => s.updateSticker);
  const layerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={layerRef} className="absolute inset-0 z-30">
      {stickers.map((sticker) => (
        <img
          key={sticker.id}
          src={sticker.url}
          alt={sticker.name}
          draggable={false}
          className="absolute cursor-grab select-none rounded-sm outline-dashed outline-1 outline-transparent transition-[outline-color] hover:outline-accent/70 active:cursor-grabbing"
          style={{
            left: `${sticker.x * 100}%`,
            top: `${sticker.y * 100}%`,
            width: `${sticker.scale * 100}%`,
            opacity: sticker.opacity,
            transform: "translate(-50%, -50%)",
          }}
          onPointerDown={(e) => {
            const layer = layerRef.current;
            if (!layer) return;
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            const rect = layer.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const origX = sticker.x;
            const origY = sticker.y;

            const onMove = (ev: PointerEvent) => {
              updateSticker(sticker.id, {
                x: clamp(origX + (ev.clientX - startX) / rect.width, 0.02, 0.98),
                y: clamp(origY + (ev.clientY - startY) / rect.height, 0.02, 0.98),
              });
            };
            const onUp = () => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        />
      ))}
    </div>
  );
}
