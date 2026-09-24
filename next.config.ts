import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/admin/guides/programmer": ["./docs/PROGRAMMER_GUIDE_DOWNLOAD.md"],
  },
};

export default nextConfig;
