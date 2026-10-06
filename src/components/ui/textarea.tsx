import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Bevel field anatomy — same skin as Input (white, hairline #d7dfec, 12px
 * radius, Metric Blue focus ring).
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-stone focus-visible:border-ring aria-invalid:border-destructive flex field-sizing-content min-h-20 w-full rounded-sm border bg-white px-3.5 py-2.5 text-sm transition-[border-color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15 aria-invalid:ring-destructive/15 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-secondary",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
