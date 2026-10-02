/** Highlighted placeholder for legal templates: renders « [[À COMPLÉTER : …]] ». */
export function Todo({ children }: { children: React.ReactNode }) {
  return (
    <mark className="rounded-sm bg-amber-soft px-1 font-medium text-amber ring-1 ring-amber/30">
      [[À COMPLÉTER : {children}]]
    </mark>
  );
}
