import type { Metadata } from "next";
import localFont from "next/font/local";
import { AirCompassProvider } from "@/components/AirCompassProvider";
import "./globals.css";

const notoSans = localFont({
  src: [
    { path: "../fonts/noto-sans-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/noto-sans-latin-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-noto-sans",
  display: "swap",
});

const notoDevanagari = localFont({
  src: [
    { path: "../fonts/noto-sans-devanagari-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/noto-sans-devanagari-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-noto-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AirCompass — Urban Air Quality Assistant",
  description:
    "Science-backed, bilingual household air quality assistant powered by indoor physics and Google Gemini.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${notoSans.variable} ${notoDevanagari.variable}`}>
      <body>
        <AirCompassProvider>{children}</AirCompassProvider>
      </body>
    </html>
  );
}
