import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: false, // We register manually in ServiceWorkerRegister component
  skipWaiting: true,
  publicExcludes: ["!manifest.json", "!icons/**/*"],
});

const nextConfig: NextConfig = {
  turbopack: {}, // Silence Turbopack warning (next-pwa uses webpack, but is disabled in dev)
};

export default withPWA(nextConfig);
