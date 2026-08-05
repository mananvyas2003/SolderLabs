import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@flux/ui", "@flux/design-core", "@flux/db", "@flux/parser"],
};

export default nextConfig;
