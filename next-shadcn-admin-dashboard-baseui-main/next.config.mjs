/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    const agentLinkHeader = [
      '</llms.txt>; rel="llms-txt"; type="text/plain"',
      '</>; rel="alternate"; type="text/markdown"',
      '</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"',
    ].join(', ');

    return [
      {
        source: '/',
        headers: [
          { key: 'Link', value: agentLinkHeader },
          { key: 'Content-Signal', value: 'search=yes, ai-input=yes, ai-train=no' },
        ],
      },
      {
        source: '/shop/:path*',
        headers: [{ key: 'Link', value: agentLinkHeader }],
      },
    ];
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
