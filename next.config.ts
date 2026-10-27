import { withWorkflow } from 'workflow/next';
import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['sharp', '@ffmpeg-installer/linux-x64'],
  outputFileTracingIncludes: { '/.well-known/workflow/v1/**': ['./node_modules/@ffmpeg-installer/linux-x64/ffmpeg','./assets/social-music/*.m4a'] },
};
export default withWorkflow(config);
