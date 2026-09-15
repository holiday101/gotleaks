"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900">
      Log out
    </button>
  );
}
