import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Bevel field anatomy (upload/PROPOSED-RMIS-DESIGN.md): white field, hairline
 * #d7dfec border, 12px radius, Metric Blue focus ring. Matches .dlg-input.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-stone selection:bg-primary selection:text-primary-foreground border-input flex h-10 w-full min-w-0 rounded-sm border bg-white px-3.5 text-sm font-normal transition-[border-color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-secondary",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/15",
        className
      )}
      {...props}
    />
  )
}

export { Input }
