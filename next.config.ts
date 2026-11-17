import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "pdfkit", "exceljs", "fontkit"],
  // Re-use pages visited in the last 30 s when going back and forth — instant navigation.
  // Any change a user makes refreshes the affected pages immediately.
  experimental: { staleTimes: { dynamic: 30 } },
  // The PDF route reads these at runtime; make sure Vercel ships them with it.
  outputFileTracingIncludes: {
    "/api/export/[kind]": ["./assets/fonts/**", "./node_modules/pdfkit/js/data/**"],
    "/api/export/**": ["./assets/fonts/**", "./node_modules/pdfkit/js/data/**"],
  },
};

export default nextConfig;
