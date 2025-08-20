import type { ReactNode } from "react";
import { cn } from "./cn";

export default function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-gray-200 bg-white p-3 shadow-sm", className)}>
      {children}
    </div>
  );
}
