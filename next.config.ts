import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Note: the previous next-pwa setup used `publicExcludes` to keep manifest.json
// and icons/ out of the precache manifest. Serwist precaches everything in
// `public/` by default, which is fine for a PWA (offline manifest + icons).
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  turbopack: {},
};

export default withSerwist(nextConfig);