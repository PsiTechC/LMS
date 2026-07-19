import type { NextConfig } from "next";

// Browser API requests stay same-origin and Next forwards them to the backend.
// This avoids browser CORS failures while preserving the existing API port.
const apiInternalUrl = (process.env.API_INTERNAL_URL || "http://localhost:8080/api/v1").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Produces a minimal, self-contained server bundle for Docker.
  output: "standalone",
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiInternalUrl}/:path*` }];
  },
};

export default nextConfig;
