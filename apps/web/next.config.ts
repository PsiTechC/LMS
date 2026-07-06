import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained server bundle for Docker.
  output: "standalone",
};

export default nextConfig;
