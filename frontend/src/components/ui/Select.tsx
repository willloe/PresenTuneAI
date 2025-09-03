import type { SelectHTMLAttributes } from "react";
import { cn } from "./cn";

export default function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return (
    <select
      className={cn(
        "rounded-md border border-gray-300 bg-white px-2 py-1 text-sm outline-none focus:ring",
        className
      )}
      {...rest}
    />
  );
}
