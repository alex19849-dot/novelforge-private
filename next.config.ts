import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["sharp", "@ffmpeg-installer/linux-x64"],
  outputFileTracingIncludes: {
    "/api/social-studio/maintenance": [
      "./node_modules/@ffmpeg-installer/linux-x64/ffmpeg",
      "./assets/social-music/*.m4a",
      "./assets/social-fonts/*",
    ],
    "/api/social-studio/poster": [
      "./node_modules/@ffmpeg-installer/linux-x64/ffmpeg",
      "./assets/social-music/*.m4a",
      "./assets/social-fonts/*",
    ],
    "/api/queues/background": [
      "./assets/social-fonts/*",
      "./node_modules/@ffmpeg-installer/linux-x64/ffmpeg",
      "./assets/social-music/*.m4a",
    ],
  },
};
export default config;
