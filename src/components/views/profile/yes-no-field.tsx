"use client";

// ============================================================================
// RMIS — Yes/No declaration field, shared by the profile sections and the
// generic record dialog. Binary questions (PWD, government service, legal
// disclosures, "currently employed here?") are enterprise DECLARATIONS: both
// answers must be visible at a glance with no hidden default.
//
// Ported 1:1 from rmis-main-ui's YesNoField (src/components/views/profile/
// form-fields.tsx): an inline radio pair — round size-4 radios, No first /
// Yes second (government-form convention), horizontal with gap-6 — rendered
// with the shared Radix RadioGroup primitives. Only differences from the
// source: our token palette (ink/graphite/dusty-rose/divider) and min-h-[44px]
// label rows so the control keeps the mandated touch target while looking
// identical. Radio semantics come from Radix (radiogroup / radio +
// aria-checked), so assistive tech announces the group and each state.
// ============================================================================

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export function YesNoField({
  label,
  value,
  onChange,
  required,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  // Repo grammar: No first, Yes second — matches the reference form exactly.
  const options: { val: string; text: string }[] = [
    { val: "no", text: "No" },
    { val: "yes", text: "Yes" },
  ];
  return (
    <div>
      {/* Same label grammar as every other field in the profile forms. */}
      <span className="mb-1.5 block text-xs font-medium text-graphite">
        {label}
        {required && <span className="text-dusty-rose"> *</span>}
      </span>
      <RadioGroup
        value={value ? "yes" : "no"}
        onValueChange={(v) => onChange(v === "yes")}
        disabled={disabled}
        aria-label={label}
        className="flex flex-row items-center gap-6 pt-1"
      >
        {options.map((o) => (
          <Label
            key={o.val}
            htmlFor={`${id}-${o.val}`}
            className={cn(
              "flex min-h-[44px] items-center gap-2 py-2.5 text-sm font-normal text-ink",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            )}
          >
            <RadioGroupItem id={`${id}-${o.val}`} value={o.val} />
            {o.text}
          </Label>
        ))}
      </RadioGroup>
    </div>
  );
}

export default YesNoField;
