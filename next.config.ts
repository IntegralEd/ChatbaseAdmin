import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Internal admin app — no public exposure needed
  // Disable x-powered-by header for minor security hygiene
  poweredByHeader: false,
};

export default nextConfig;
