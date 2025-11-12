import type { NextConfig } from "next";

// Check if this is a desktop build (API routes should be excluded)
const isDesktopBuild = process.env.BUILD_MODE === 'desktop' || process.env.NEXT_PUBLIC_BUILD_TARGET === 'desktop';

const nextConfig: NextConfig = {
  /* config options here */
  output: isDesktopBuild ? 'export' : undefined,
  distDir: 'out',
  // Use relative paths for static assets in Electron builds
  // This ensures that file:// protocol can properly resolve asset paths
  assetPrefix: isDesktopBuild ? '.' : undefined,
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
};

export default nextConfig;
