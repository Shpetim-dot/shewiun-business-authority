import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SHEWIUN | Business Authority",
  description: "Geschäftliche Vollmachten und Laufzeit-Autorisierung für KI-Agenten.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
