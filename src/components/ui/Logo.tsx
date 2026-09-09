export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-ink" />
        <span className="absolute inset-[5px] rounded-full border border-canvas" />
      </span>
      <span className="text-[15px] font-medium tracking-tight">Orbis</span>
    </span>
  );
}
