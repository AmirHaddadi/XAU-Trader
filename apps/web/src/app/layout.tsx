import type { Metadata, Viewport } from "next";
import "@fortawesome/fontawesome-svg-core/styles.css";
import "@/lib/fontawesome";
import "./globals.css";

export const metadata: Metadata = {
  title: "XAU Trader",
  description: "Local live gold trading dashboard, driven by the XAU-Trader MT5 Expert Advisor.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// Matches site.webmanifest's theme_color — see globals.css's --color-accent.
export const viewport: Viewport = { themeColor: "#d97757" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
