import { queueSocialJob } from '../../../../lib/social-job-server';
export const runtime='nodejs';
export async function POST(request:Request) { return queueSocialJob(request,'music'); }
