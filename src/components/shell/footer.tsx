"use client";

// ============================================================================
// RMIS — Shell footer (enterprise executive band): dark ink footer with the
// brand lockup, portal links, and the Data Privacy Act compliance note, then
// a hairline bottom strip with the Republic of the Philippines government
// line. Rendered as the last child of the min-h-screen flex column shells —
// `mt-auto` keeps it pinned to the bottom on short pages and pushed down
// naturally on long ones. DO NOT remove mt-auto.
// ============================================================================

import Image from "next/image";
import { navigate } from "@/lib/router";

export function Footer() {
  return (
    <footer className="relative mt-auto overflow-hidden bg-[#12141c] text-[rgba(242,244,249,0.64)]">
      {/* Metric Blue aurora — quiet echo of the hero band */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(700px 240px at 92% 0%, rgba(65,94,238,0.14), transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8">
        {/* Top row — brand / links / compliance */}
        <div className="grid gap-10 py-10 sm:py-12 md:grid-cols-[1.4fr_1fr_1.4fr] md:gap-8">
          {/* Brand */}
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-white p-[5px] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-white/25">
                <Image
                  src="/logo-dost.png"
                  alt="DOST seal"
                  width={20}
                  height={20}
                  className="object-contain"
                />
                <span aria-hidden="true" className="h-2/3 w-px bg-black/15" />
                <Image
                  src="/logo-mirdc.png"
                  alt="MIRDC emblem"
                  width={20}
                  height={20}
                  className="object-contain"
                />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#f2f4f9]">MIRDC Recruitment</p>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[rgba(242,244,249,0.42)]">
                  Recruitment Management Information System
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-[13px] leading-relaxed">
              The official hiring portal of the Metals Industry Research and
              Development Center — an agency of the Department of Science and
              Technology, Republic of the Philippines.
            </p>
          </div>

          {/* Portal links */}
          <nav aria-label="Footer">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(242,244,249,0.42)]">
              Portal
            </p>
            <ul className="mt-4 space-y-2.5 text-[13px]">
              <li>
                <button
                  onClick={() => navigate("vacant-positions")}
                  className="transition-colors hover:text-[#f2f4f9]"
                >
                  Vacant Positions
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("contact")}
                  className="transition-colors hover:text-[#f2f4f9]"
                >
                  Contact Us
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("signin")}
                  className="transition-colors hover:text-[#f2f4f9]"
                >
                  Staff Sign In
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate("signup")}
                  className="transition-colors hover:text-[#f2f4f9]"
                >
                  Create an Account
                </button>
              </li>
            </ul>
          </nav>

          {/* Compliance */}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(242,244,249,0.42)]">
              Data Privacy
            </p>
            <p className="mt-4 text-[13px] leading-relaxed">
              Protected under the Data Privacy Act of 2012 (RA 10173). Personal
              information is used solely for recruitment and is accessible only
              to authorized DOST-MIRDC personnel.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Image
                src="/govph-seal-mono-footer.jpg"
                alt="Republic of the Philippines government seal"
                width={44}
                height={44}
                className="h-11 w-11 rounded-full object-contain opacity-80 ring-1 ring-white/15"
              />
              <p className="text-[12px] leading-snug">
                An official government
                <br />
                information system.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="flex flex-col gap-2 border-t border-white/[0.08] py-5 text-[12px] sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} RMIS · Metals Industry Research and Development Center</p>
          <p className="text-[rgba(242,244,249,0.42)]">Republic of the Philippines · Department of Science and Technology</p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
