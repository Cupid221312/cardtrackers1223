/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server bundle for Docker (`node server.js`).
  output: "standalone",
  // The ffmpeg/ffprobe installers resolve real binary paths at runtime;
  // keep them (and ytdl-core) out of the webpack bundle so those paths and
  // dynamic requires stay valid on the server.
  experimental: {
    serverComponentsExternalPackages: [
      "@ffmpeg-installer/ffmpeg",
      "@ffprobe-installer/ffprobe",
      "@distube/ytdl-core",
    ],
  },
};

export default nextConfig;
