import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/ai_cost_simulator",
  images: {
    unoptimized: true, // Required for static export
  },
};

export default nextConfig;
