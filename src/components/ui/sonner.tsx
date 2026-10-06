"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"

// The design system is light-only (no .dark token block in globals.css), and
// the globals restyle forces white toast chrome — so the theme is fixed here
// and next-themes is not pulled into the client bundle.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
