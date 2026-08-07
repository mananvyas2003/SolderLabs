import type { Metadata } from "next";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
});

export const metadata: Metadata = {
  title: "SolderLab — GitHub for Hardware",
  description:
    "Version, review, and release electronics designs together — with AI that understands what actually changed on the board.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sora.variable} ${plex.variable}`}>
      <body
        className="antialiased"
        style={{
          fontFamily: "var(--font-sora), var(--font-sans)",
        }}
      >
        {children}
      </body>
    </html>
  );
}
