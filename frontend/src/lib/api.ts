import { cookies } from "next/headers";

// Two different base URLs on purpose:
// - NEXT_PUBLIC_API_URL is baked into the browser bundle and used by every
//   client component's fetch() calls. In dev it's the backend's own origin
//   (http://localhost:8000); in production it's a same-origin path prefix
//   ("/water") that nginx proxies to the backend -- see deploy/nginx.conf.
// - BACKEND_INTERNAL_URL is server-only (no NEXT_PUBLIC_ prefix, never sent
//   to the browser) and used ONLY here, for the Next.js server process's own
//   fetches to FastAPI during SSR. Those calls never go through nginx --
//   they're a direct process-to-process call on the same machine -- so a
//   path like "/water" would be meaningless here; it needs a real origin.
//   Defaults to NEXT_PUBLIC_API_URL, which is correct for local dev where
//   both values happen to be the same backend origin.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Server-side fetch to the FastAPI backend that forwards the visitor's
 * session cookie along -- needed because this runs on the Next.js server,
 * not in the browser, so the cookie isn't attached automatically the way it
 * would be for a client-side fetch() with credentials: "include".
 */
export async function serverFetch(path: string, init?: RequestInit) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // non-JSON error body, keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

export type Session = { email: string; role: "viewer" | "admin" | "global"; public_mode: boolean } | null;

/** Current visitor's session, or null if not logged in / PUBLIC_MODE is off
 * (in which case the backend always reports a synthetic "global" session --
 * see auth.get_current_user in the backend). Never throws. */
export async function getSession(): Promise<Session> {
  try {
    return await serverFetch("/api/auth/me");
  } catch {
    return null;
  }
}

export const ROLE_RANK: Record<string, number> = { viewer: 0, admin: 1, global: 2 };

export function hasRole(session: Session, minRole: "viewer" | "admin" | "global"): boolean {
  if (!session) return false;
  return ROLE_RANK[session.role] >= ROLE_RANK[minRole];
}
