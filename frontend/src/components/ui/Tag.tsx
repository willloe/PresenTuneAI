import React from "react";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
export type Size = "xs" | "sm" | "md";
export type Radius = "sm" | "md" | "lg" | "full";

type Props = {
  children: React.ReactNode;
  /** Preferred: visual tone */
  tone?: Tone;
  /** Back-compat alias for `tone` */
  variant?: Tone;
  size?: Size;
  rounded?: Radius;
  className?: string;
};

function toneClasses(t: Tone) {
  switch (t) {
    case "success":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "warning":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "danger":
      return "bg-rose-50 text-rose-700 border border-rose-200";
    case "info":
      return "bg-indigo-50 text-indigo-700 border border-indigo-200";
    case "neutral":
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function sizeClasses(s: Size) {
  switch (s) {
    case "xs":
      return "text-[11px] px-2 py-0.5";
    case "md":
      return "text-sm px-3 py-1";
    case "sm":
    default:
      return "text-xs px-2 py-0.5";
  }
}

function radiusClasses(r: Radius) {
  switch (r) {
    case "sm":
      return "rounded";
    case "md":
      return "rounded-md";
    case "lg":
      return "rounded-lg";
    case "full":
    default:
      return "rounded-full";
  }
}

export default function Tag({
  children,
  tone,
  variant,
  size = "sm",
  rounded = "full",
  className = "",
}: Props) {
  const finalTone: Tone = (tone ?? variant ?? "neutral") as Tone;
  const cls = [
    toneClasses(finalTone),
    sizeClasses(size),
    radiusClasses(rounded),
    "inline-block align-middle",
    className,
  ].join(" ");
  return <span className={cls}>{children}</span>;
}
