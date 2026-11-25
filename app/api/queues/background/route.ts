import { backgroundQueue } from '../../../../lib/background-queue';
import { processBackground, type BackgroundMessage } from '../../../../lib/background-worker';
export const runtime='nodejs';
export const maxDuration=300;
export const POST=backgroundQueue.handleCallback<BackgroundMessage>(processBackground,{
  visibilityTimeoutSeconds:330,
  retry:(_error,metadata)=>({afterSeconds:metadata.deliveryCount<3?30:600}),
});
