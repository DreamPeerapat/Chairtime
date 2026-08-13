import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typedRoutes: true,
  eslint: {
    // `pnpm lint` runs eslint in CI; keep `next build` focused on compiling.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
