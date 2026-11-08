/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [
      {
        source: '/admin.html',
        destination: '/dashboard/ecommerce/',
        permanent: false,
      },
      {
        source: '/admin',
        destination: '/dashboard/ecommerce/',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
