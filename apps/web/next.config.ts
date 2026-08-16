import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@solderlab/ui",
    "@solderlab/design-core",
    "@solderlab/db",
    "@solderlab/parser",
    "@solderlab/parts",
  ],
  // Keep soft-navigated app pages warm so tabs feel instant after first visit.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
