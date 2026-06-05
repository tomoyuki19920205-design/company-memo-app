/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // すべてのルートに適用
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            // 自サイト と TDNET Alerts (web-psi-six-68) からの iframe を許可
            value:
              "frame-ancestors 'self' https://web-psi-six-68.vercel.app;",
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
