import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@solderlab/ui", "@solderlab/design-core", "@solderlab/db", "@solderlab/parser"],
};

export default nextConfig;
