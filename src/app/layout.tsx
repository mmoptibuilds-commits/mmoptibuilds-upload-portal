import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "mmoptibuilds Upload", description: "Secure client asset transfer for mmoptibuilds.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
