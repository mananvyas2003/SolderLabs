import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SolderLab — Hardware collaboration",
  description:
    "Version, review, and release electronics designs — with rule-based review and evidence links.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className="antialiased"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        {children}
      </body>
    </html>
  );
}
