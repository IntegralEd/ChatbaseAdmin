/** @type {import('next').NextConfig} */
const nextConfig = {
  // Internal admin app — no public exposure needed
  // Disable x-powered-by header for minor security hygiene
  poweredByHeader: false,
};

export default nextConfig;
