import { cn } from "@/lib/utils";

// ============================================================================
// RMIS — Official brand lockup. The agency mark is composed of TWO emblems:
// the DOST pinwheel seal (logo-dost.png) and the MIRDC gear emblem
// (logo-mirdc.png), shown side by side. Both source PNGs carry TRANSPARENT
// backgrounds, so no plate is drawn — the lockup floats directly on the
// surface behind it (white on the public header, ink on the dark rail).
// tone adapts the divider hairline to the surface: "light" (default) draws a
// dark hairline for light backgrounds, "dark" a light one for dark rails.
// ============================================================================

export function BrandLogo({
  logoSize = 22,
  tone = "light",
  className,
}: {
  /** Height of each emblem in px (the chip adds 4px padding around). */
  logoSize?: number;
  /** Surface tone behind the lockup — picks the divider hairline color. */
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 p-1",
        className
      )}
      style={{ height: logoSize + 8 }}
    >
      <img
        src="/logo-dost.png"
        alt="DOST seal"
        style={{ height: logoSize, width: logoSize }}
        className="object-contain"
      />
      <span
        aria-hidden="true"
        className={cn("h-2/3 w-px", tone === "dark" ? "bg-white/25" : "bg-black/15")}
      />
      <img
        src="/logo-mirdc.png"
        alt="MIRDC emblem"
        style={{ height: logoSize, width: logoSize }}
        className="object-contain"
      />
    </span>
  );
}
