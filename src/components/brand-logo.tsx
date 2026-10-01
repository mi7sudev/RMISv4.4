import { cn } from "@/lib/utils";

// ============================================================================
// RMIS — Official brand lockup. The agency mark is composed of TWO emblems:
// the DOST pinwheel seal (logo-dost.png) and the MIRDC gear emblem
// (logo-mirdc.png). Both source PNGs carry TRANSPARENT backgrounds, so they
// are mounted on a crisp WHITE PLATE (rounded, hairline ring, soft shadow) —
// this keeps the lockup legible on the dark Executive-Ink rail, the dark
// hero band, and the white public header alike, and removes the "floating
// glitch" look of bare transparent emblems. The divider tone adapts: on the
// white plate it is always a dark hairline; `tone` is kept for API
// compatibility and only nudges the plate ring for dark surfaces.
// ============================================================================

export function BrandLogo({
  logoSize = 22,
  tone = "light",
  className,
}: {
  /** Height of each emblem in px (the plate adds 5px padding around). */
  logoSize?: number;
  /** Kept for call-site compatibility. "dark" softens the plate ring for
   *  dark surfaces (rail / hero) — the plate itself stays white. */
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-white shadow-[0_1px_2px_rgba(31,32,37,0.12)]",
        tone === "dark" ? "ring-1 ring-white/25" : "ring-1 ring-black/[0.07]",
        className
      )}
      style={{ height: logoSize + 10, padding: 5 }}
    >
      <img
        src="/logo-dost.png"
        alt="DOST seal"
        style={{ height: logoSize, width: logoSize }}
        className="object-contain"
      />
      <span aria-hidden="true" className="h-2/3 w-px bg-black/15" />
      <img
        src="/logo-mirdc.png"
        alt="MIRDC emblem"
        style={{ height: logoSize, width: logoSize }}
        className="object-contain"
      />
    </span>
  );
}
