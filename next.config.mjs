/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emits .next/standalone with a self-contained server.js — copied into the
  // Docker runner stage and started with `node server.js`.
  output: "standalone",
};

export default nextConfig;
