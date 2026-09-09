import { previewFromInput, type LandingPreview } from "@/lib/runtime/preview";

export function LivePreview({ input }: { input: string }) {
  const preview = previewFromInput(input);
  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[0_1px_0_rgba(16,17,20,0.04)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="ml-3 text-xs text-muted">Live · company fills as you type</span>
      </div>
      {preview ? <Filled preview={preview} /> : <Empty />}
    </div>
  );
}

function Empty() {
  return (
    <div className="grid gap-3 p-5 md:grid-cols-2">
      <div className="h-24 rounded-[10px] bg-canvas" />
      <div className="h-24 rounded-[10px] bg-canvas" />
      <p className="col-span-full text-sm text-muted">Paste a site. Facts, hypotheses and missing stay separate before any agent runs.</p>
    </div>
  );
}

function Filled({ preview }: { preview: LandingPreview }) {
  return (
    <div className="grid gap-px bg-line md:grid-cols-2">
      <div className="bg-surface p-5">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Profile</p>
        <p className="mt-2 font-medium">{preview.name}</p>
        <p className="text-xs text-muted">{preview.industry}</p>
        <ul className="mt-4 space-y-3">
          {preview.facts.map((fact) => (
            <li key={fact.label} className="fade-in">
              <p className="text-[11px] uppercase tracking-wide text-muted">
                {fact.kind} · {fact.label}
              </p>
              <p className="mt-1 text-sm leading-6">{fact.value}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-surface p-5">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Why now</p>
        <p className="mt-2 font-medium">{preview.signal.title}</p>
        <p className="mt-2 text-sm leading-6 text-muted">{preview.signal.whyNow}</p>
        <div className="mt-5 rounded-[10px] bg-canvas px-3 py-3">
          <p className="text-xs text-muted">First capability</p>
          <p className="mt-1 text-sm font-medium">{preview.capability}</p>
          <p className="mt-2 text-xs text-muted">Roles run as protocol. You never draw a graph.</p>
        </div>
      </div>
    </div>
  );
}
