import { getSession, hasRole } from "@/lib/api";
import Locked from "@/components/Locked";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const session = await getSession();
  if (!hasRole(session, "admin")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Locked label="Manage Users" requiredRole="admin" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">Manage users</h1>
      <p className="text-sm text-gray-500 mb-6">
        Admins can create viewer and admin accounts. Only global accounts can create other global
        accounts.
      </p>
      <UsersClient isGlobal={session!.role === "global"} selfEmail={session!.email} />
    </main>
  );
}
