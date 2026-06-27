/// <reference lib="webworker" />

import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

// Serwist injects the precache manifest into `self.__SW_MANIFEST` at build time.
declare const self: ServiceWorkerGlobalScope &
  SerwistGlobalConfig & {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  };

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // Default Next.js caching strategies (fonts, static assets, images, API, etc.),
  // matching the runtime-caching behavior the previous next-pwa setup used.
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();