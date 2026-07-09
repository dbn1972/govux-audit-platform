/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // proxy API calls to the FastAPI backend. In docker-compose the API is the
    // `api` service; on a host `npm run dev` set GOVUX_API_URL=http://localhost:8000.
    const api = process.env.GOVUX_API_URL || "http://api:8000";
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
};
module.exports = nextConfig;
