import { getSession, hasRole } from "@/lib/api";
import Locked from "@/components/Locked";
import SyncClient from "./SyncClient";

export default async function SyncPage() {
  const session = await getSession();
  if (!hasRole(session, "global")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Locked label="Sync & Backfill" requiredRole="global" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">Sync from Neptune 360</h1>
      <SyncClient />
    </main>
  );
}
