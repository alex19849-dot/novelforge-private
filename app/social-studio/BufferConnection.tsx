"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type Channel = {
  id: string;
  name: string;
  service: string;
  organizationId: string;
  isDisconnected: boolean;
  isLocked: boolean;
  isQueuePaused: boolean;
};
type Connection = {
  organizations: { id: string; name: string }[];
  channels: Channel[];
  checkedAt: string;
};
const platforms = [
  { service: "tiktok", label: "TikTok" },
  { service: "instagram", label: "Instagram" },
  { service: "facebook", label: "Facebook" },
];

export default function BufferConnection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<Connection | null>(null);

  async function check() {
    setBusy(true);
    setError("");
    setConnection(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) throw new Error("Sign in to NovelForge again, then check Buffer.");
      const response = await fetch("/api/social-studio/buffer/connection", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The Buffer check failed. Try again shortly.");
      if (!Array.isArray(result.channels) || !Array.isArray(result.organizations)) throw new Error("The connection check returned an invalid response.");
      setConnection(result);
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== "TimeoutError"
        ? failure.message : "The connection check timed out. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="buffer-connection-heading" className="mb-7 rounded-2xl border border-white/10 bg-neutral-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="buffer-connection-heading" className="text-lg font-semibold">Publishing connection</h2>
          <p className="mt-1 text-sm text-neutral-400">Check your Buffer accounts. This check does not schedule or publish posts.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void check()} className="rounded-xl bg-pink-500 px-4 py-3 font-semibold text-white hover:bg-pink-400 disabled:cursor-wait disabled:opacity-50">
          {busy ? "Checking Buffer..." : "Check Buffer connection"}
        </button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
        {connection && <>
          <p className="mt-4 text-sm text-neutral-300">Buffer API key accepted. {connection.channels.length} connected account(s) found.</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {platforms.map((platform) => {
              const channels = connection.channels.filter((channel) => channel.service === platform.service);
              return <li key={platform.service} className="rounded-xl border border-white/10 bg-neutral-950 p-3">
                <p className="font-semibold">{platform.label}</p>
                {!channels.length && <p className="mt-1 text-sm text-amber-300">Not connected in Buffer</p>}
                {channels.map((channel) => <div key={channel.id} className="mt-2 text-sm">
                  <p className="break-words text-neutral-300">{channel.name}</p>
                  <p className={channel.isDisconnected || channel.isLocked || channel.isQueuePaused ? "text-amber-300" : "text-emerald-300"}>
                    {channel.isDisconnected ? "Reconnect this account in Buffer" : channel.isLocked ? "Account is locked in Buffer" : channel.isQueuePaused ? "Queue is paused in Buffer" : "Connected"}
                  </p>
                </div>)}
              </li>;
            })}
          </ul>
          <p className="mt-3 text-xs text-neutral-500">Connection checked only. Automatic publishing has not been enabled.</p>
        </>}
      </div>
    </section>
  );
}
