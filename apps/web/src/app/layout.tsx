import type { Metadata } from "next";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "@/lib/fontawesome";
import "./globals.css";

export const metadata: Metadata = {
  title: "XAU Trader",
  description: "Local live gold trading dashboard, driven by the XAU-Trader MT5 Expert Advisor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
