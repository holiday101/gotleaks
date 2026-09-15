import Link from "next/link";
import { getSession, hasRole } from "@/lib/api";
import LogoutButton from "./LogoutButton";

const LINKS: { href: string; label: string; minRole: "viewer" | "admin" | "global" }[] = [
  { href: "/customers", label: "Customers", minRole: "viewer" },
  { href: "/", label: "Water Usage", minRole: "viewer" },
  { href: "/continuous-users", label: "Continuous Users", minRole: "viewer" },
  { href: "/map", label: "Map", minRole: "viewer" },
  { href: "/users", label: "Manage Users", minRole: "admin" },
  { href: "/sync", label: "Sync & Backfill", minRole: "global" },
  { href: "/ask", label: "Ask AI", minRole: "global" },
];

export default async function Nav() {
  const session = await getSession();

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
