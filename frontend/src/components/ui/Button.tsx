import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "solid" | "outline" | "ghost" | "danger";
type Size = "xs" | "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const base =
  "inline-flex items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const sizes: Record<Size, string> = {
  xs: "px-2 py-1 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-3.5 py-2 text-sm",
};

const variants: Record<Variant, string> = {
  solid: "bg-black text-white hover:opacity-90",
  outline: "border border-gray-300 hover:bg-gray-50 text-gray-900",
  ghost: "hover:bg-gray-50 text-gray-900",
  danger: "border border-red-500 text-red-600 hover:bg-red-50",
};

export default function Button({ variant = "outline", size = "sm", className, ...rest }: ButtonProps) {
  return <button className={cn(base, sizes[size], variants[variant], className)} {...rest} />;
}
