/**
 * Author: Ali Quraishi
 */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PairSpace",
  description: "Remote pair programming and whiteboarding, in sync.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
