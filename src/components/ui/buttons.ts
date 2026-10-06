// ============================================================================
// RMIS — THE button system (Bevel edition). Single source of truth for every
// button class combination in the app. The capsules themselves are styled by
// globals.css (.dlg-cta = RMIS Electric Blue primary, .dlg-ghost = white
// secondary); these constants add the standard layout/anatomy so call sites
// never re-type them (and never drift).
//
// Import from here everywhere:
//   import { ctaBtn, ghostBtn, ghostBadBtn, iconBtn, iconBtnBad } from "@/components/ui/buttons";
// ============================================================================

/** Primary CTA — RMIS Electric Blue capsule (44px, white ink, hover darkens). */
export const ctaBtn =
  "dlg-cta inline-flex min-h-[44px] items-center justify-center gap-2 px-5 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-50";

/** Secondary — white ghost capsule (44px, hairline border). */
export const ghostBtn =
  "dlg-ghost inline-flex min-h-[44px] items-center justify-center gap-2 px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** Destructive ghost — white capsule with the functional --bad tint. The ONE
 *  destructive-confirm recipe (AlertDialogAction, row deletes, cancels). */
export const ghostBadBtn =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[var(--bad)]/30 bg-white px-4 text-sm font-medium text-[var(--bad)] transition-colors hover:bg-[var(--bad-bg)] disabled:cursor-not-allowed disabled:opacity-50";

/** 36px quiet round icon button (cloud tile on hover) for row quick actions. */
export const iconBtn =
  "grid h-9 w-9 place-items-center rounded-full text-stone transition-colors hover:bg-cloud hover:text-ink focus-ring";

/** 36px destructive round icon button for row quick actions. */
export const iconBtnBad =
  "grid h-9 w-9 place-items-center rounded-full text-[var(--bad)] transition-colors hover:bg-[var(--bad-bg)] focus-ring";

/** Modifier-only destructive ghost (append to ghostBtn when a full control
 *  already carries the capsule base, e.g. AlertDialogAction). */
export const ghostBadModifier =
  "border-[var(--bad)]/30 bg-white text-[var(--bad)] hover:bg-[var(--bad-bg)]";
