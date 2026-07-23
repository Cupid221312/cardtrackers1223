"use client";

import { useRef, useState } from "react";
import {
  useEditorStore,
  useSelectedClip,
  useSelectedClipKeyframes,
} from "@/lib/store/editorStore";
import { CAPTION_TEMPLATES, TEMPLATE_LABELS } from "@/lib/captionTemplates";
import { COLOR_GRADES, COLOR_GRADE_IDS } from "@/lib/colorGrades";
import { findEnergyPeaks, peaksToZoomKeyframes } from "@/services/ai/audioEnergy";
import { ASPECT_IDS } from "@/lib/aspects";
import type { CaptionTemplateId } from "@/lib/types";
import { formatTimecode } from "@/lib/time";
import clsx from "clsx";

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v: number) => v.toFixed(2),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-400">{label}</span>
        <span className="text-[11px] tabular-nums text-slate-500">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <input
        type="color"
        className="h-6 w-9 cursor-pointer rounded border border-ink-600 bg-transparent"
        value={value || "#000000"}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function InspectorPanel() {
  const style = useEditorStore((s) => s.captionStyle);
  const captionsEnabled = useEditorStore((s) => s.captionsEnabled);
  const banner = useEditorStore((s) => s.hookBanner);
  const framing = useEditorStore((s) => s.framing);
  const aspectRatio = useEditorStore((s) => s.aspectRatio);
  const filters = useEditorStore((s) => s.filters);
  const audio = useEditorStore((s) => s.audio);
  const silenceCut = useEditorStore((s) => s.silenceCut);
  const progressBar = useEditorStore((s) => s.progressBar);
  const stickers = useEditorStore((s) => s.stickers);
  const clip = useSelectedClip();
  const keyframes = useSelectedClipKeyframes();
  const currentTime = useEditorStore((s) => s.currentTime);
  const source = useEditorStore((s) => s.source);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const [reframing, setReframing] = useState(false);
  const [reframeNote, setReframeNote] = useState("");
  const [energyZooming, setEnergyZooming] = useState(false);
  const trackPicking = useEditorStore((s) => s.trackPicking);
  const trackDuration = useEditorStore((s) => s.trackDuration);

  async function autoZoomEnergy() {
    if (!source || !clip) return;
    setEnergyZooming(true);
    setReframeNote("");
    try {
      const res = await fetch(`/api/media/${source.mediaId}/waveform`);
      const body = await res.json();
      const peaksArr: number[] = Array.isArray(body.peaks) ? body.peaks : [];
      const found = findEnergyPeaks(peaksArr, source.duration, clip.start, clip.end);
      if (found.length === 0) {
        setReframeNote("No strong audio peaks found in this clip.");
        return;
      }
      const kfs = peaksToZoomKeyframes(found, clip.start, clip.end);
      st().updateFraming({ mode: "crop", panX: 0, panY: 0, zoom: 1 });
      st().setKeyframes(clip.id, kfs);
      setReframeNote(`Punch-in on ${found.length} hype moment${found.length === 1 ? "" : "s"}.`);
    } catch {
      setReframeNote("Audio-energy analysis failed.");
    } finally {
      setEnergyZooming(false);
    }
  }

  const st = () => useEditorStore.getState();

  async function autoReframe() {
    if (!source || !clip) return;
    setReframing(true);
    setReframeNote("");
    try {
      const res = await fetch(`/api/media/${source.mediaId}/reframe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: clip.start, end: clip.end }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Auto-reframe failed");
      st().updateFraming({ mode: "crop", zoom: 1, panX: 0, panY: 0 });
      st().setKeyframes(clip.id, body.keyframes);
      setReframeNote(
        body.confidence < 0.2
          ? "Low motion detected — framing kept near center."
          : `Tracked motion → ${body.keyframes.length} pan keyframes.`,
      );
    } catch (err) {
      setReframeNote(err instanceof Error ? err.message : "Auto-reframe failed");
    } finally {
      setReframing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ---- caption style ------------------------------------------------ */}
      <section className="panel p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="panel-title">Caption Style</h2>
          <button
            onClick={() => st().setCaptionsEnabled(!captionsEnabled)}
            className={clsx(
              "rounded-full px-2.5 py-1 text-[10px] font-bold transition",
              captionsEnabled
                ? "bg-accent/20 text-accent-glow hover:bg-accent/30"
                : "bg-ink-700 text-slate-400 hover:bg-ink-600",
            )}
            title="Turn all captions on/off (preview + export)"
          >
            {captionsEnabled ? "CAPTIONS ON" : "CAPTIONS OFF"}
          </button>
        </div>
        <div
          className={clsx(
            "mb-3 grid grid-cols-2 gap-1.5",
            !captionsEnabled && "pointer-events-none opacity-40",
          )}
        >
          {(Object.keys(CAPTION_TEMPLATES) as CaptionTemplateId[]).map((id) => (
            <button
              key={id}
              onClick={() => st().applyTemplate(id)}
              className={clsx(
                "rounded-lg border px-1 py-2 text-center transition",
                style.template === id
                  ? "border-accent/70 bg-accent/10"
                  : "border-ink-700 bg-ink-900 hover:border-ink-500",
              )}
            >
              <TemplateSwatch id={id} />
              <span className="mt-1 block text-[10px] font-medium text-slate-300">
                {TEMPLATE_LABELS[id]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <Slider
            label="Font size"
            value={style.fontSize}
            min={0.02}
            max={0.07}
            step={0.001}
            onChange={(v) => st().updateCaptionStyle({ fontSize: v })}
            format={(v) => `${Math.round(v * 1920)}px`}
          />
          <Slider
            label="Vertical position"
            value={style.verticalPosition}
            min={0.1}
            max={0.9}
            step={0.01}
            onChange={(v) => st().updateCaptionStyle({ verticalPosition: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Words per caption"
            value={style.maxWordsPerLine}
            min={1}
            max={12}
            step={1}
            onChange={(v) => st().updateCaptionStyle({ maxWordsPerLine: v })}
            format={(v) => String(v)}
          />
          <Slider
            label="Font weight"
            value={style.fontWeight}
            min={400}
            max={900}
            step={100}
            onChange={(v) => st().updateCaptionStyle({ fontWeight: v })}
            format={(v) => String(v)}
          />
          <div className="grid grid-cols-2 gap-2">
            <ColorField
              label="Text"
              value={style.textColor}
              onChange={(v) => st().updateCaptionStyle({ textColor: v })}
            />
            <ColorField
              label="Active"
              value={style.activeColor}
              onChange={(v) => st().updateCaptionStyle({ activeColor: v })}
            />
          </div>
          <div>
            <span className="mb-1 block text-[11px] font-medium text-slate-400">
              Entrance animation
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  "none",
                  "fade",
                  "pop",
                  "slide",
                  "bounce",
                  "reveal",
                  "typewriter",
                ] as const
              ).map((anim) => (
                <button
                  key={anim}
                  onClick={() => st().updateCaptionStyle({ animation: anim })}
                  className={clsx(
                    "rounded-lg border px-2 py-1 text-[11px] font-medium capitalize transition",
                    style.animation === anim
                      ? "border-accent/70 bg-accent/10 text-white"
                      : "border-ink-700 bg-ink-900 text-slate-400 hover:border-ink-500",
                  )}
                  title={
                    anim === "reveal"
                      ? "Word-by-word appear (word-highlight mode)"
                      : anim === "typewriter"
                        ? "Type the active word letter-by-letter (word-highlight mode)"
                        : undefined
                  }
                >
                  {anim}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400">
              <span>Auto-highlight keywords</span>
              <input
                type="checkbox"
                className="accent-accent"
                checked={style.highlightKeywords}
                onChange={(e) =>
                  st().updateCaptionStyle({ highlightKeywords: e.target.checked })
                }
              />
            </label>
            {style.highlightKeywords && (
              <ColorField
                label="Highlight color"
                value={style.accentColor}
                onChange={(v) => st().updateCaptionStyle({ accentColor: v })}
              />
            )}
            <label className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400">
              <span>Auto-emoji ✨</span>
              <input
                type="checkbox"
                className="accent-accent"
                checked={style.autoEmoji}
                onChange={(e) =>
                  st().updateCaptionStyle({ autoEmoji: e.target.checked })
                }
              />
            </label>
            <label
              className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400"
              title="Alternate word colors between the text color and the accent color."
            >
              <span>Two-tone words</span>
              <input
                type="checkbox"
                className="accent-accent"
                checked={style.twoTone}
                onChange={(e) =>
                  st().updateCaptionStyle({ twoTone: e.target.checked })
                }
              />
            </label>
            {style.twoTone && (
              <ColorField
                label="Second color"
                value={style.accentColor}
                onChange={(v) => st().updateCaptionStyle({ accentColor: v })}
              />
            )}
            <label
              className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400"
              title="Solid rounded box behind the caption block."
            >
              <span>Caption box</span>
              <input
                type="checkbox"
                className="accent-accent"
                checked={!!style.boxColor}
                onChange={(e) =>
                  st().updateCaptionStyle({
                    boxColor: e.target.checked ? "#0c0e13" : "",
                  })
                }
              />
            </label>
            {style.boxColor && (
              <ColorField
                label="Box color"
                value={style.boxColor}
                onChange={(v) => st().updateCaptionStyle({ boxColor: v })}
              />
            )}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
              <input
                type="checkbox"
                className="accent-accent"
                checked={style.uppercase}
                onChange={(e) =>
                  st().updateCaptionStyle({ uppercase: e.target.checked })
                }
              />
              UPPERCASE
            </label>
            <label
              className="flex items-center gap-2 text-[11px] font-medium text-slate-400"
              title="On: short word groups with the spoken word highlighted. Off: whole phrases held on screen (Reels style)."
            >
              <input
                type="checkbox"
                className="accent-accent"
                checked={style.karaoke}
                onChange={(e) =>
                  st().updateCaptionStyle({ karaoke: e.target.checked })
                }
              />
              Word highlight
            </label>
          </div>
        </div>
      </section>

      {/* ---- hook banner -------------------------------------------------- */}
      <section className="panel p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="panel-title">Hook Banner</h2>
          <input
            type="checkbox"
            className="accent-accent"
            checked={banner.enabled}
            onChange={(e) => st().updateHookBanner({ enabled: e.target.checked })}
          />
        </div>
        <textarea
          className="text-input resize-none"
          rows={2}
          value={banner.text}
          onChange={(e) => st().updateHookBanner({ text: e.target.value })}
          placeholder="Punchy title shown at the top of the clip"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ColorField
            label="Banner"
            value={banner.bgColor}
            onChange={(v) => st().updateHookBanner({ bgColor: v })}
          />
          <ColorField
            label="Text"
            value={banner.textColor}
            onChange={(v) => st().updateHookBanner({ textColor: v })}
          />
        </div>
        <div className="mt-2">
          <Slider
            label="Position"
            value={banner.verticalPosition}
            min={0.02}
            max={0.4}
            step={0.01}
            onChange={(v) => st().updateHookBanner({ verticalPosition: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      </section>

      {/* ---- layout & framing --------------------------------------------- */}
      <section className="panel p-3">
        <h2 className="panel-title mb-2.5">Layout & Framing</h2>
        <div className="mb-2.5">
          <span className="mb-1 block text-[11px] font-medium text-slate-400">
            Aspect ratio
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {ASPECT_IDS.map((a) => (
              <button
                key={a}
                onClick={() => st().setAspectRatio(a)}
                className={clsx(
                  "rounded-lg border px-1 py-1.5 text-[11px] font-medium transition",
                  aspectRatio === a
                    ? "border-accent/70 bg-accent/10 text-white"
                    : "border-ink-700 bg-ink-900 text-slate-400 hover:border-ink-500",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-2.5 grid grid-cols-2 gap-1.5">
          <button
            className={clsx(
              "rounded-lg border px-2 py-1.5 text-xs font-medium transition",
              framing.mode === "fit-blur"
                ? "border-accent/70 bg-accent/10 text-white"
                : "border-ink-700 bg-ink-900 text-slate-400 hover:border-ink-500",
            )}
            onClick={() => st().updateFraming({ mode: "fit-blur" })}
          >
            Blur Fill
          </button>
          <button
            className={clsx(
              "rounded-lg border px-2 py-1.5 text-xs font-medium transition",
              framing.mode === "crop"
                ? "border-accent/70 bg-accent/10 text-white"
                : "border-ink-700 bg-ink-900 text-slate-400 hover:border-ink-500",
            )}
            onClick={() => st().updateFraming({ mode: "crop" })}
          >
            Crop 9:16
          </button>
        </div>
        <div className="flex flex-col gap-2.5">
          <Slider
            label="Zoom"
            value={framing.zoom}
            min={1}
            max={2.5}
            step={0.01}
            onChange={(v) => st().updateFraming({ zoom: v })}
            format={(v) => `${v.toFixed(2)}×`}
          />
          <Slider
            label="Pan X"
            value={framing.panX}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => st().updateFraming({ panX: v })}
          />
          <Slider
            label="Pan Y"
            value={framing.panY}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => st().updateFraming({ panY: v })}
          />
          {framing.mode === "fit-blur" && (
            <Slider
              label="Background blur"
              value={filters.backgroundBlur}
              min={0}
              max={60}
              step={1}
              onChange={(v) => st().updateFilters({ backgroundBlur: v })}
              format={(v) => `${v}px`}
            />
          )}
        </div>

        <button
          className="btn-ghost mt-2.5 w-full !py-1.5 text-xs"
          onClick={autoReframe}
          disabled={!clip || !source || reframing}
          title="Track motion across the clip and generate pan keyframes"
        >
          {reframing ? "Analyzing motion…" : "✦ Auto-reframe (motion tracking)"}
        </button>
        <button
          className={clsx(
            "mt-1.5 w-full rounded-lg border px-3 py-1.5 text-xs font-medium transition",
            trackPicking
              ? "border-brand-yellow/70 bg-brand-yellow/10 text-brand-yellow"
              : "border-ink-600 bg-ink-800 text-slate-200 hover:border-ink-500 hover:bg-ink-700",
          )}
          onClick={() => st().setTrackPicking(!trackPicking)}
          disabled={!clip || !source}
          title="Drop a circle on a person's head in the preview — the frame will follow them"
        >
          {trackPicking
            ? "Click the subject's head in the preview…"
            : "🎯 Track a head (place a circle)"}
        </button>
        <div className="mt-1.5">
          <Slider
            label="Track for"
            value={trackDuration}
            min={1}
            max={Math.max(2, Math.round((clip?.end ?? 30) - (clip?.start ?? 0)))}
            step={1}
            onChange={(v) => st().setTrackDuration(v)}
            format={(v) => `${Math.round(v)}s`}
          />
        </div>
        <button
          className="btn-ghost mt-1.5 w-full !py-1.5 text-xs"
          onClick={() => {
            if (!clip) return;
            const s = st();
            // Alternate 1.0× / 1.12× per caption line — reads as hard
            // punch-in cuts because lines are back-to-back.
            const lines = s.captionLines
              .filter((l) => l.end > clip.start && l.start < clip.end)
              .slice(0, 30);
            if (lines.length < 2) return;
            const kfs = lines.flatMap((l, i) => {
              const zoom = i % 2 === 1 ? 1.12 : 1.0;
              return [
                {
                  id: `pi-${i}a`,
                  time: Math.max(0, l.start - clip.start),
                  zoom,
                  panX: 0,
                  panY: 0,
                },
                {
                  id: `pi-${i}b`,
                  time: Math.min(clip.end, l.end) - clip.start,
                  zoom,
                  panX: 0,
                  panY: 0,
                },
              ];
            });
            s.setKeyframes(clip.id, kfs);
          }}
          disabled={!clip}
          title="Alternate punch-in zoom on every caption line (Hormozi-style cuts)"
        >
          ⚡ Auto punch-in zooms
        </button>
        <button
          className="btn-ghost mt-1.5 w-full !py-1.5 text-xs"
          onClick={autoZoomEnergy}
          disabled={!clip || !source || energyZooming}
          title="Punch in on the loudest / hype moments (audio energy)"
        >
          {energyZooming ? "Analyzing audio…" : "🔊 Auto-zoom on energy"}
        </button>
        {reframeNote && (
          <p className="mt-1.5 text-[11px] text-slate-500">{reframeNote}</p>
        )}

        {/* keyframes */}
        <div className="mt-3 border-t border-ink-700 pt-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-400">
              Zoom/Pan keyframes
            </span>
            <button
              className="btn-ghost !px-2 !py-1 text-[11px]"
              disabled={!clip}
              onClick={() => {
                if (!clip) return;
                st().addKeyframe(clip.id, {
                  id: `kf-${Date.now()}`,
                  time: Math.max(0, currentTime - clip.start),
                  zoom: framing.zoom,
                  panX: framing.panX,
                  panY: framing.panY,
                });
              }}
            >
              + Add at playhead
            </button>
          </div>
          <div className="mt-1.5 flex flex-col gap-1">
            {keyframes.map((kf) => (
              <div
                key={kf.id}
                className="flex items-center justify-between rounded-md bg-ink-900 px-2 py-1 text-[11px] text-slate-400"
              >
                <span className="tabular-nums">
                  {formatTimecode(kf.time)} · {kf.zoom.toFixed(2)}×
                </span>
                <button
                  className="text-slate-600 hover:text-brand-red"
                  onClick={() => clip && st().removeKeyframe(clip.id, kf.id)}
                  aria-label="Delete keyframe"
                >
                  ✕
                </button>
              </div>
            ))}
            {keyframes.length === 0 && (
              <p className="text-[11px] text-slate-600">
                Scrub to a moment, set zoom/pan, then add a keyframe.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---- visual filters ----------------------------------------------- */}
      <section className="panel p-3">
        <h2 className="panel-title mb-2.5">Visual Filters</h2>
        <div className="flex flex-col gap-2.5">
          <Slider
            label="Brightness"
            value={filters.brightness}
            min={-0.5}
            max={0.5}
            step={0.01}
            onChange={(v) => st().updateFilters({ brightness: v })}
          />
          <Slider
            label="Contrast"
            value={filters.contrast}
            min={0.5}
            max={1.8}
            step={0.01}
            onChange={(v) => st().updateFilters({ contrast: v })}
          />
          <Slider
            label="Saturation"
            value={filters.saturation}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => st().updateFilters({ saturation: v })}
          />
        </div>

        <div className="mt-3 border-t border-ink-700 pt-2.5">
          <span className="mb-1.5 block text-[11px] font-medium text-slate-400">
            Cinematic grade
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {COLOR_GRADE_IDS.map((id) => (
              <button
                key={id}
                onClick={() => st().updateFilters({ grade: id })}
                className={clsx(
                  "rounded-lg border px-1 py-1.5 text-[10px] font-medium transition",
                  filters.grade === id
                    ? "border-accent/70 bg-accent/10 text-white"
                    : "border-ink-700 bg-ink-900 text-slate-400 hover:border-ink-500",
                )}
                title={COLOR_GRADES[id].label}
              >
                {COLOR_GRADES[id].label.replace("Cinematic ", "")}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 border-t border-ink-700 pt-2.5">
          <label className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400">
            <span>Progress bar</span>
            <input
              type="checkbox"
              className="accent-accent"
              checked={progressBar.enabled}
              onChange={(e) =>
                st().updateProgressBar({ enabled: e.target.checked })
              }
            />
          </label>
          {progressBar.enabled && (
            <div className="mt-2 flex flex-col gap-2">
              <ColorField
                label="Bar color"
                value={progressBar.color}
                onChange={(v) => st().updateProgressBar({ color: v })}
              />
              <Slider
                label="Thickness"
                value={progressBar.thickness}
                min={0.003}
                max={0.03}
                step={0.001}
                onChange={(v) => st().updateProgressBar({ thickness: v })}
                format={(v) => `${Math.round(v * 1920)}px`}
              />
            </div>
          )}
        </div>
      </section>

      {/* ---- audio -------------------------------------------------------- */}
      <section className="panel p-3">
        <h2 className="panel-title mb-2.5">Audio</h2>
        <div className="flex flex-col gap-2.5">
          <Slider
            label="Clip volume"
            value={audio.volume}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => st().updateAudio({ volume: v })}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <label className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <input
              type="checkbox"
              className="accent-accent"
              checked={silenceCut.enabled}
              onChange={(e) =>
                st().updateSilenceCut({ enabled: e.target.checked })
              }
            />
            Remove silences (jump cuts)
          </label>
          {silenceCut.enabled && (
            <Slider
              label="Cut pauses longer than"
              value={silenceCut.minGap}
              min={0.3}
              max={1.5}
              step={0.05}
              onChange={(v) => st().updateSilenceCut({ minGap: v })}
              format={(v) => `${v.toFixed(2)}s`}
            />
          )}
          <label className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <input
              type="checkbox"
              className="accent-accent"
              checked={audio.noiseReduction}
              onChange={(e) =>
                st().updateAudio({ noiseReduction: e.target.checked })
              }
            />
            Noise reduction (applied on export)
          </label>
          <label className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
            <input
              type="checkbox"
              className="accent-accent"
              checked={audio.volumeLeveling}
              onChange={(e) =>
                st().updateAudio({ volumeLeveling: e.target.checked })
              }
            />
            Loudness leveling (broadcast -14 LUFS)
          </label>
          <div className="border-t border-ink-700 pt-2.5">
            {audio.musicUrl ? (
              <div className="flex items-center justify-between rounded-md bg-ink-900 px-2 py-1.5 text-[11px]">
                <span className="truncate text-slate-300">🎵 {audio.musicName}</span>
                <button
                  className="ml-2 text-slate-600 hover:text-brand-red"
                  onClick={() =>
                    st().updateAudio({
                      musicUrl: "",
                      musicMediaId: "",
                      musicName: "",
                    })
                  }
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                className="btn-ghost w-full !py-1.5 text-xs"
                onClick={() => musicInputRef.current?.click()}
              >
                + Background music track
              </button>
            )}
            <input
              ref={musicInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const res = await fetch("/api/upload", {
                    method: "POST",
                    headers: {
                      "x-filename": f.name,
                      "content-type": f.type || "application/octet-stream",
                    },
                    body: f,
                  });
                  const body = await res.json();
                  st().updateAudio({
                    musicUrl: URL.createObjectURL(f),
                    musicMediaId: res.ok ? body.mediaId : "",
                    musicName: f.name,
                  });
                } catch {
                  st().updateAudio({
                    musicUrl: URL.createObjectURL(f),
                    musicMediaId: "",
                    musicName: `${f.name} (preview only)`,
                  });
                }
              }}
            />
            {audio.musicUrl && (
              <div className="mt-2 flex flex-col gap-2">
                <Slider
                  label="Music volume"
                  value={audio.musicVolume}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) => st().updateAudio({ musicVolume: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                <label className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400">
                  <span>Auto-duck under speech</span>
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={audio.ducking}
                    onChange={(e) => st().updateAudio({ ducking: e.target.checked })}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ---- stickers & branding ------------------------------------------ */}
      <section className="panel p-3">
        <h2 className="panel-title mb-2.5">Stickers & Branding</h2>
        <button
          className="btn-ghost w-full !py-1.5 text-xs"
          onClick={() => logoInputRef.current?.click()}
        >
          + Upload logo / watermark
        </button>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => {
              st().addSticker({
                id: `sticker-${Date.now()}`,
                name: f.name,
                url: URL.createObjectURL(f),
                dataUrl: String(reader.result),
                x: 0.85,
                y: 0.06,
                scale: 0.18,
                opacity: 0.95,
              });
            };
            reader.readAsDataURL(f);
          }}
        />
        <div className="mt-2 flex flex-col gap-2">
          {stickers.map((sticker) => (
            <div
              key={sticker.id}
              className="rounded-lg border border-ink-700 bg-ink-900 p-2"
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-[11px] font-medium text-slate-300">
                  {sticker.name}
                </span>
                <button
                  className="text-slate-600 hover:text-brand-red"
                  onClick={() => st().removeSticker(sticker.id)}
                  aria-label="Remove sticker"
                >
                  ✕
                </button>
              </div>
              <div className="mt-1.5 flex flex-col gap-1.5">
                <Slider
                  label="Size"
                  value={sticker.scale}
                  min={0.05}
                  max={0.6}
                  step={0.01}
                  onChange={(v) => st().updateSticker(sticker.id, { scale: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                <Slider
                  label="Opacity"
                  value={sticker.opacity}
                  min={0.1}
                  max={1}
                  step={0.01}
                  onChange={(v) => st().updateSticker(sticker.id, { opacity: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-600">
                Drag it on the canvas to reposition.
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- animated graphic overlays ------------------------------------- */}
      <section className="panel p-3">
        <h2 className="panel-title mb-2.5">Motion Graphics</h2>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => {
              if (!clip) return;
              st().addOverlay({
                id: `ov-${Date.now()}`,
                kind: "notification",
                text: "New comment",
                subtext: "@creator",
                x: 0.5,
                y: 0.3,
                scale: 0.15,
                color: "#ff0000",
                rotation: 0,
                start: clip.start,
                end: clip.start + 2,
              });
            }}
            className="btn-ghost !py-1.5 text-[10px]"
          >
            💬 Notification
          </button>
          <button
            onClick={() => {
              if (!clip) return;
              st().addOverlay({
                id: `ov-${Date.now()}`,
                kind: "subscribe",
                text: "SUBSCRIBE",
                subtext: "",
                x: 0.5,
                y: 0.8,
                scale: 0.12,
                color: "#ff0000",
                rotation: 0,
                start: clip.start,
                end: clip.start + 2,
              });
            }}
            className="btn-ghost !py-1.5 text-[10px]"
          >
            🔔 Subscribe
          </button>
          <button
            onClick={() => {
              if (!clip) return;
              st().addOverlay({
                id: `ov-${Date.now()}`,
                kind: "emoji",
                text: "🔥",
                subtext: "",
                x: 0.7,
                y: 0.3,
                scale: 0.1,
                color: "",
                rotation: 0,
                start: clip.start,
                end: clip.start + 1.5,
              });
            }}
            className="btn-ghost !py-1.5 text-[10px]"
          >
            🔥 Emoji
          </button>
          <button
            onClick={() => {
              if (!clip) return;
              st().addOverlay({
                id: `ov-${Date.now()}`,
                kind: "arrow",
                text: "➜",
                subtext: "",
                x: 0.3,
                y: 0.5,
                scale: 0.1,
                color: "#ffd400",
                rotation: 0,
                start: clip.start,
                end: clip.start + 2,
              });
            }}
            className="btn-ghost !py-1.5 text-[10px]"
          >
            ➜ Arrow
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          {useEditorStore((s) => s.overlays).map((ov) => (
            <div
              key={ov.id}
              className="rounded-lg border border-ink-700 bg-ink-900 p-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-300">
                  {ov.kind.toUpperCase()}: {ov.text}
                </span>
                <button
                  className="text-slate-600 hover:text-brand-red"
                  onClick={() => st().removeOverlay(ov.id)}
                  aria-label="Remove overlay"
                >
                  ✕
                </button>
              </div>
              <div className="mt-1 flex flex-col gap-1">
                <Slider
                  label="Start"
                  value={ov.start}
                  min={0}
                  max={clip?.end ?? 60}
                  step={0.05}
                  onChange={(v) => st().updateOverlay(ov.id, { start: v })}
                  format={(v) => formatTimecode(v)}
                />
                <Slider
                  label="Duration"
                  value={ov.end - ov.start}
                  min={0.2}
                  max={5}
                  step={0.05}
                  onChange={(v) => st().updateOverlay(ov.id, { end: ov.start + v })}
                  format={(v) => `${v.toFixed(1)}s`}
                />
                {ov.kind !== "emoji" && (
                  <input
                    type="color"
                    value={ov.color}
                    onChange={(e) =>
                      st().updateOverlay(ov.id, { color: e.target.value })
                    }
                    className="h-6 w-full cursor-pointer rounded"
                    title="Overlay color"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TemplateSwatch({ id }: { id: CaptionTemplateId }) {
  const t = CAPTION_TEMPLATES[id];
  const word = (w: string) => (t.uppercase ? w.toUpperCase() : w);
  return (
    <div className="flex h-8 items-center justify-center rounded bg-black/60">
      <span
        className={clsx("text-[9px] leading-none", t.karaoke && "font-caption")}
        style={{
          color: t.textColor,
          fontWeight: t.fontWeight,
          textShadow: t.strokeColor ? `1px 1px 0 ${t.strokeColor}` : undefined,
        }}
      >
        {word("make")}{" "}
        {t.karaoke ? (
          <span
            style={{
              color: t.activeColor,
              backgroundColor: t.activeBgColor || undefined,
              padding: t.activeBgColor ? "0 2px" : undefined,
              borderRadius: 2,
            }}
          >
            {word("money")}
          </span>
        ) : (
          word("money")
        )}
      </span>
    </div>
  );
}
