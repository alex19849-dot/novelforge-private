import { AsyncLocalStorage } from 'node:async_hooks';
const execution = new AsyncLocalStorage<string>();
export const withBackgroundExecution = <T>(id: string, run: () => Promise<T>) => execution.run(id, run);
export function getWorkflowMetadata() {
  const workflowRunId = execution.getStore();
  if (!workflowRunId) throw new Error('A durable queue worker is required.');
  return { workflowRunId };
}
export class FatalError extends Error {}
