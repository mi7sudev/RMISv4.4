// ============================================================================
// RMIS — Shell footer, ported from rmis-main-ui's Footer (src/components/
// footer.tsx): hairline top rule, generous padding, and the GovPH seal —
// `govph-seal-mono-footer.jpg` — anchored bottom-left as a 10%-opacity
// watermark BEHIND the footer contents (seal z-0, contents z-10). Soft
// capsule icon chip — pale Cloud tile with the brand-blue shield; muted
// stone ink for the note.
// Rendered as the last child of the min-h-screen flex column shells —
// `mt-auto` keeps it pinned to the bottom on short pages and pushed down
// naturally on long ones. DO NOT remove mt-auto / relative / overflow-hidden.
// ============================================================================

import Image from "next/image";
import { ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative mt-auto overflow-hidden border-t border-divider/70 bg-card">
      {/* GovPH seal — bottom-left watermark behind the contents */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-0 opacity-10">
        <Image
          src="/govph-seal-mono-footer.jpg"
          alt=""
          width={320}
          height={320}
          className="h-40 w-40 object-contain sm:h-56 sm:w-56"
          aria-hidden
        />
      </div>

      {/* Footer content — z-10 so it sits above the seal */}
      {/* max-w matches the app's single 1600px container (AppShell main,
          SiteHeader, WorkspaceHeader) so footer contents align with the
          page grid on ultrawide displays. */}
      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex max-w-2xl items-start gap-3 text-xs leading-relaxed text-body-gray">
            {/* Icon chip — soft capsule Cloud tile */}
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-cloud text-metric-blue">
              <ShieldCheck className="size-4" />
            </span>
            <p>
              Protected under the Data Privacy Act of 2012 (RA 10173). Personal
              information is used solely for recruitment and is accessible only
              to authorized DOST-MIRDC personnel.
            </p>
          </div>
          <p className="eyebrow shrink-0">
            © {new Date().getFullYear()} RMIS
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
