import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Concurrent `next dev` instances (e.g. the two-process SQLite concurrency
  // test) must not share one build dir: a second dev server's webpack writes
  // clobber the first one's route manifest on some platforms, making every
  // API route 404. Key the dev build dir off PORT when set; production builds
  // and plain `npm run dev` keep `.next`.
  distDir:
    process.env.NODE_ENV === "development" && process.env.PORT
      ? `.next-${process.env.PORT}`
      : ".next",
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
