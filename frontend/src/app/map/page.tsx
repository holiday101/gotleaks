import { getSession, hasRole } from "@/lib/api";
import Locked from "@/components/Locked";
import MapClient from "./MapClient";

export default async function MapPage() {
  const session = await getSession();
  if (!hasRole(session, "viewer")) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Locked label="Map" requiredRole="viewer" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">🗺️ Meter map</h1>
      <p className="text-sm text-gray-500 mb-4">
        Parcels colored by leak status this week (yellow to red), plus the utility&apos;s
        GPS-surveyed meter locations as red dots.
      </p>
      <MapClient />
    </main>
  );
}
