import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;      // accessible label
  square?: number;    // px
};

export default function IconButton({ label, square = 28, className, children, ...rest }: Props & { children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      style={{ width: square, height: square }}
      {...rest}
    >
      {children}
    </button>
  );
}
