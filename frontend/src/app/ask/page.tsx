import { getSession, hasRole } from "@/lib/api";
import Locked from "@/components/Locked";
import AskClient from "./AskClient";

export default async function AskPage() {
  const session = await getSession();
  if (!hasRole(session, "global")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Locked label="Ask AI" requiredRole="global" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">Ask AI about your data</h1>
      <p className="text-sm text-gray-500 mb-6">
        Natural-language question &rarr; read-only SQL &rarr; plain-language summary. Only reads
        already-synced local data.
      </p>
      <AskClient />
    </main>
  );
}
