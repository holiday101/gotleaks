import Link from "next/link";
import { getSession, hasRole, serverFetch } from "@/lib/api";
import LogoutButton from "./LogoutButton";

const LINKS: { href: string; label: string; minRole: "viewer" | "admin" | "global" }[] = [
  { href: "/customers", label: "Customers", minRole: "viewer" },
  { href: "/", label: "Water Usage", minRole: "viewer" },
  { href: "/continuous-users", label: "Continuous Users", minRole: "viewer" },
  { href: "/map", label: "Map", minRole: "viewer" },
  { href: "/notifications", label: "Notify Residents", minRole: "admin" },
  { href: "/users", label: "Manage Users", minRole: "admin" },
  { href: "/sync", label: "Sync & Backfill", minRole: "global" },
  { href: "/ask", label: "Ask AI", minRole: "global" },
];

function formatRelativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function Nav() {
  const session = await getSession();
  const lastUpdated = session
    ? await serverFetch("/api/sync/last-updated")
        .then((r) => r.last_synced_at as string | null)
        .catch(() => null)
    : null;

  return (
    <header className="border-b border-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <Link href="/" className="font-semibold text-lg shrink-0">
          💧 GotLeaks AI
        </Link>
        <nav className="flex items-center gap-4 flex-wrap text-sm">
          {LINKS.map((link) => {
            const allowed = hasRole(session, link.minRole);
            return (
              <Link
                key={link.href}
                href={allowed ? link.href : "#"}
                className={allowed ? "text-gray-700 hover:text-gray-900" : "text-gray-300 cursor-not-allowed"}
                title={allowed ? undefined : `Requires a ${link.minRole} account`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm shrink-0">
          {session ? (
            <>
              <span className="text-gray-500">
                {session.email} ({session.role})
              </span>
              {lastUpdated && (
                <span className="text-gray-400" title={new Date(lastUpdated).toString()}>
                  Data updated {formatRelativeTime(lastUpdated)}
                </span>
              )}
              {session.public_mode && <LogoutButton />}
            </>
          ) : (
            <Link href="/login" className="text-gray-700 hover:text-gray-900">
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
