/** @type {import('next').NextConfig} */
module.exports = {
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
  output: "standalone",
};
