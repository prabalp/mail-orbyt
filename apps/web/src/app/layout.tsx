import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mail Orbyt",
  description: "AI-assisted personalised outbound email campaigns.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
