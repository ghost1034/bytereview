"use client"

import { cn } from "@/lib/utils"

export interface FocusBackgroundProps {
  className?: string
}

export function FocusBackground({ className }: FocusBackgroundProps) {
  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      style={{
        backgroundImage: "url('/inkwise/focus-background.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#0f172a",
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
        style={{
          background: "linear-gradient(to top, rgba(15, 23, 42, 0.8) 0%, transparent 100%)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(8,10,15,0.7) 100%)",
        }}
      />
    </div>
  )
}
