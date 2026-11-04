import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SHEWIUN | S-PRO Partner Demo",
  description: "Business Authority, Authorization Contracts and AI-agent security assurance for banking and fintech workflows.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
