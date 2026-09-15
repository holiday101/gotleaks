"use client";

import { useEffect, useState, useCallback } from "react";

type User = {
  id: number;
  email: string;
  role: "viewer" | "admin" | "global";
  active: number;
  created_by: string | null;
  created_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function UsersClient({ isGlobal, selfEmail }: { isGlobal: boolean; selfEmail: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"viewer" | "admin" | "global">("viewer");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/users`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.rows);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const res = await fetch(`${API_URL}/api/users`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.detail ?? "Failed to create user");
      return;
    }
    setSuccess(`Created ${role} account for ${email}.`);
    setEmail("");
    setPassword("");
    setRole("viewer");
    load();
  }

  async function toggleActive(user: User) {
    const res = await fetch(`${API_URL}/api/users/${user.id}/active`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    if (res.ok) load();
  }

  const globalActiveCount = users.filter((u) => u.role === "global" && u.active).length;
  const allowedRoles: ("viewer" | "admin" | "global")[] = isGlobal ? ["viewer", "admin", "global"] : ["viewer", "admin"];

  return (
    <div>
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr className="text-left border-b border-gray-300">
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Created by</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const isSelf = u.email === selfEmail;
            const isLastGlobal = u.role === "global" && !!u.active && globalActiveCount <= 1;
            const disabled = isSelf || isLastGlobal;
            return (
              <tr key={u.id} className="border-b border-gray-100">
                <td className="py-1.5 pr-4">{u.email}</td>
                <td className="py-1.5 pr-4">{u.role}</td>
                <td className="py-1.5 pr-4">{u.active ? "active" : "inactive"}</td>
                <td className="py-1.5 pr-4 text-gray-500">{u.created_by ?? ""}</td>
                <td className="py-1.5 pr-4">
                  <button
                    onClick={() => toggleActive(u)}
                    disabled={disabled}
                    className="text-blue-700 disabled:text-gray-300 hover:underline"
                  >
                    {u.active ? "Deactivate" : "Reactivate"}
                  </button>
                  {isSelf && <span className="text-gray-400 text-xs ml-1">(you)</span>}
                  {isLastGlobal && !isSelf && <span className="text-gray-400 text-xs ml-1">(last global)</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2 className="text-lg font-medium mb-3">Create a user</h2>
      <form onSubmit={handleCreate} className="flex flex-col gap-3 max-w-sm">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <input
          type="password"
          placeholder="Temporary password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
        >
          {allowedRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
        {success && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{success}</div>
        )}
        <button type="submit" className="bg-gray-900 text-white rounded px-3 py-2 text-sm font-medium">
          Create user
        </button>
      </form>
    </div>
  );
}
