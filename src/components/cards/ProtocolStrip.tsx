import { getCrew } from "@/lib/capabilities/crews";

export function ProtocolStrip({ slug }: { slug: string }) {
  const crew = getCrew(slug);
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">
        {crew.department} · {crew.process} process
      </p>
      <div className="mt-3 flex min-w-max items-center gap-2">
        {crew.roles.map((role, index) => (
          <span key={role.id} className="flex items-center gap-2">
            <span className="rounded-[8px] bg-canvas px-3 py-2">
              <span className="block text-sm font-medium">{role.role}</span>
              <span className="block max-w-[160px] text-[11px] text-muted">{role.goal}</span>
            </span>
            {index < crew.roles.length - 1 ? <span className="text-muted">→</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
