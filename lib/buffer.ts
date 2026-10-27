// Server-side only. Never import this module into a client component.
export class BufferConnectionError extends Error {
  status:number;
  constructor(message: string, status = 502) {
    super(message);
    this.status=status;
  }
}

export type BufferChannel = {
  id: string;
  name: string;
  service: string;
  organizationId: string;
  isDisconnected: boolean;
  isLocked: boolean;
  isQueuePaused: boolean;
};

async function query<T>(key: string, document: string, variables = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch("https://api.buffer.com", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: document, variables }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new BufferConnectionError("Buffer could not be reached. Try the connection check again shortly.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new BufferConnectionError("Buffer rejected the API key or its permissions. Check the key in Vercel and its access in Buffer.");
  }
  if (response.status === 429) {
    throw new BufferConnectionError("Buffer's API request limit has been reached. Wait before checking again.", 429);
  }
  if (!response.ok) throw new BufferConnectionError("Buffer is temporarily unavailable. Try again shortly.");
  let result: { data?: T; errors?: unknown[] };
  try { result = await response.json(); }
  catch { throw new BufferConnectionError("Buffer returned an unreadable response. Try again shortly."); }
  // Do not expose upstream bodies: they can contain sensitive connection details.
  if (result.errors?.length || !result.data) {
    throw new BufferConnectionError("Buffer could not read your accounts. Check that the API key has account and channel read access.");
  }
  return result.data;
}

export async function checkBufferConnection() {
  const key = process.env.BUFFER_API_KEY?.trim();
  if (!key) throw new BufferConnectionError("BUFFER_API_KEY is missing from this deployment. Add it in Vercel and redeploy.", 503);
  const { account } = await query<{ account: { organizations: { id: string; name: string }[] } }>(
    key, "query NovelForgeBufferAccount { account { organizations { id name } } }",
  );
  if (!Array.isArray(account?.organizations)) throw new BufferConnectionError("Buffer did not return your account details.");
  const organizations = account.organizations;
  const results = await Promise.all(organizations.map(async (organization) => {
    const result = await query<{ channels: BufferChannel[] }>(key,
      `query NovelForgeBufferChannels($organizationId: OrganizationId!) {
        channels(input: { organizationId: $organizationId }) {
          id name service organizationId isDisconnected isLocked isQueuePaused
        }
      }`, { organizationId: organization.id });
    if (!Array.isArray(result.channels)) throw new BufferConnectionError("Buffer did not return your connected channels.");
    return result.channels;
  }));
  return { organizations, channels: results.flat(), checkedAt: new Date().toISOString() };
}
