export default function Locked({ label, requiredRole }: { label: string; requiredRole: string }) {
  return (
    <div className="rounded border border-yellow-300 bg-yellow-50 text-yellow-900 px-4 py-3 text-sm">
      🔒 {label} requires a <strong>{requiredRole}</strong> account. Log out and sign in with an
      account that has access.
    </div>
  );
}
