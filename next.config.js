/**
 * Author: Ali Quraishi
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // tldraw + yjs ship ESM that Next needs to transpile for the server build
  transpilePackages: ["tldraw", "yjs"],
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
};

module.exports = nextConfig;
