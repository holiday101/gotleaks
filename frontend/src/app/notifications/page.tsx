import { getSession, hasRole } from "@/lib/api";
import Locked from "@/components/Locked";
import NotificationsClient from "./NotificationsClient";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!hasRole(session, "admin")) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Locked label="Notify Residents" requiredRole="admin" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">Leak notice template</h1>
      <p className="text-sm text-gray-500 mb-6">
        Edit the email residents get when flagged on the Continuous Users page, or upload a new
        .docx to replace it. Merge fields like {"{{resident_name}}"} get filled in per recipient
        when a notice is sent.
      </p>
      <NotificationsClient />
    </main>
  );
}
