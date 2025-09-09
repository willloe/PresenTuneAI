import * as React from "react";
import { type HTMLMotionProps } from "framer-motion";
import { M } from "./Motion";
import { cn } from "./cn";

type Variant = "solid" | "outline" | "ghost" | "danger";
type Size = "xs" | "sm" | "md";

export type ButtonProps = Omit<HTMLMotionProps<"button">, "ref"> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  /** If provided, forces a square button of N px (useful for icon buttons). */
  square?: number;
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

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "outline",
      size = "sm",
      fullWidth = false,
      square,
      className,
      whileTap = { scale: 0.98 },
      whileHover = { y: -1 },
      style,
      ...rest
    },
    ref
  ) => {
    const dimStyle =
      typeof square === "number" ? { width: square, height: square } : undefined;

    return (
      <M.button
        ref={ref}
        whileTap={whileTap}
        whileHover={whileHover}
        className={cn(
          base,
          sizes[size],
          variants[variant],
          fullWidth ? "w-full" : "",
          className
        )}
        style={{ ...dimStyle, ...style }}
        {...rest}
      />
    );
  }
);

Button.displayName = "Button";
export default Button;
