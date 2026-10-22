import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backstage | Columbia Chuckles admin",
  description: "Superadmin-only admin area for Columbia Chuckles.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
