import { queueSocialJob } from '../../../../lib/social-job-server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const POST = (request: Request) => queueSocialJob(request,'media');
