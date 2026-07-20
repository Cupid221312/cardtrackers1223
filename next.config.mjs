/** @type {import('next').NextConfig} */
const nextConfig = {
  // ffmpeg-static / ffprobe-static resolve real binary paths at runtime;
  // keep them out of the webpack bundle so those paths stay valid.
  experimental: {
    serverComponentsExternalPackages: [
      "@ffmpeg-installer/ffmpeg",
      "@ffprobe-installer/ffprobe",
      "@distube/ytdl-core",
    ],
  },
};

export default nextConfig;
