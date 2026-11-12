import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "pdfkit", "exceljs", "fontkit"],
  // Re-use pages visited in the last 30 s when going back and forth — instant navigation.
  // Any change a user makes refreshes the affected pages immediately.
  experimental: { staleTimes: { dynamic: 30 } },
  outputFileTracingIncludes: { "/api/export/**": ["./assets/fonts/**"] },
};

export default nextConfig;
