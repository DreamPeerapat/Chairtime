import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  images: {
    remotePatterns: [
      {
        // Portfolio photos. Every Vercel Blob store gets its own subdomain, so
        // the host is not known until the store exists — hence the wildcard
        // rather than a literal hostname. `next/image` refuses to optimise any
        // host not listed here, which is what stops the app being turned into
        // an image proxy for the rest of the internet.
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
};

export default nextConfig;
