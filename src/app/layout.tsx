import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster as Sonner } from "@/components/ui/sonner";

// Dialog type system: Inter for body/UI and display headings (the Bevel
// display classes all resolve to the same system+Inter stack — one font,
// zero dead font downloads).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RMIS",
  description:
    "Recruitment Management Information System of the Metals Industry Research and Development Center (DOST-MIRDC). Browse positions, apply online, and track your application.",
  icons: { icon: "/MIRDC-mark.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased bg-background text-foreground`}>
        {children}
        <Sonner position="top-right" />
      </body>
    </html>
  );
}
