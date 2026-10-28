import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Leave room for multipart overhead above the 3 MB image limit.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
