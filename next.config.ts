import type { NextConfig } from "next";

/**
 * NOTE: the create-next-app 16.x template enables `cacheComponents` and `partialPrefetching`.
 * Both produce a static shell whose scripts cannot carry a per-request nonce, so a nonce CSP builds
 * fine and then blocks hydration in production. Keep them OFF for this project.
 * Do NOT export `runtime` from route files while cacheComponents is on (build error); Node.js is the default anyway.
 */
const staticSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
