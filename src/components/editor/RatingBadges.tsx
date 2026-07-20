"use client";

import type { ClipRating } from "@/lib/types";
import { toGrade } from "@/services/ai/rating";
import clsx from "clsx";

/** Color a score/grade the way creator tools do: green good → red weak. */
export function scoreColor(value: number): string {
  if (value >= 82) return "text-brand-green";
  if (value >= 63) return "text-brand-yellow";
  return "text-brand-red";
}

function gradeBg(value: number): string {
  if (value >= 82) return "bg-brand-green/15 text-brand-green";
  if (value >= 63) return "bg-brand-yellow/15 text-brand-yellow";
  return "bg-brand-red/15 text-brand-red";
}

const AXES: Array<[keyof ClipRating, string]> = [
  ["hook", "Hook"],
  ["flow", "Flow"],
  ["value", "Value"],
  ["trend", "Trend"],
];

/** The four-axis grade rows shown next to a big overall score. */
export function RatingAxes({
  rating,
  size = "sm",
}: {
  rating: ClipRating;
  size?: "sm" | "lg";
}) {
  return (
    <div className={clsx("flex flex-col", size === "lg" ? "gap-1.5" : "gap-1")}>
      {AXES.map(([key, label]) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <span
            className={clsx(
              "w-7 text-center font-bold tabular-nums",
              size === "lg" ? "text-sm" : "text-[11px]",
              scoreColor(rating[key]),
            )}
          >
            {toGrade(rating[key])}
          </span>
          <span
            className={clsx(
              "flex-1 font-medium text-slate-400",
              size === "lg" ? "text-sm" : "text-[11px]",
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Compact grade chips (Hook/Flow/Value/Trend) for dense clip cards. */
export function GradeChips({ rating }: { rating: ClipRating }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {AXES.map(([key, label]) => (
        <span
          key={key}
          className={clsx(
            "rounded px-1 py-0.5 text-[9px] font-semibold",
            gradeBg(rating[key]),
          )}
          title={`${label}: ${rating[key]}/100`}
        >
          {label[0]}
          {toGrade(rating[key])}
        </span>
      ))}
    </div>
  );
}
