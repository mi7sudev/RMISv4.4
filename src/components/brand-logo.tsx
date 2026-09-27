import { cn } from "@/lib/utils";

// ============================================================================
// RMIS — Official brand lockup. The agency mark is composed of TWO emblems:
// the DOST pinwheel seal (logo-dost.png) and the MIRDC gear emblem
// (logo-mirdc.png), shown side by side on the official black plate. The
// source PNGs carry the black background, so the plate is always rendered —
// it blends seamlessly on the dark rail and reads as an official chip on
// light surfaces.
// ============================================================================

export function BrandLogo({
  logoSize = 22,
  className,
}: {
  /** Height of each emblem in px (the chip adds 4px padding around). */
  logoSize?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 bg-black p-1",
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
      <span aria-hidden="true" className="h-2/3 w-px bg-white/25" />
      <img
        src="/logo-mirdc.png"
        alt="MIRDC emblem"
        style={{ height: logoSize, width: logoSize }}
        className="object-contain"
      />
    </span>
  );
}
