import { ok } from "@/lib/api/http";
import { PACKAGES } from "@/lib/capabilities/registry";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").toLowerCase();
  const maturity = searchParams.get("maturity");
  const role = searchParams.get("role");
  const tool = searchParams.get("tool");
  const industry = searchParams.get("industry");
  const items = PACKAGES.filter((pkg) => {
    const blob = `${pkg.name} ${pkg.outcome} ${pkg.description} ${pkg.category} ${pkg.roles.join(" ")} ${pkg.tools.join(" ")}`.toLowerCase();
    if (q && !blob.includes(q)) return false;
    if (maturity && pkg.maturity !== maturity) return false;
    if (role && !pkg.roles.some((item) => item.toLowerCase() === role.toLowerCase())) return false;
    if (tool && !pkg.tools.some((item) => item.toLowerCase().includes(tool.toLowerCase()))) return false;
    if (industry && !pkg.industries.some((item) => item.toLowerCase().includes(industry.toLowerCase()))) return false;
    return true;
  });
  return ok({ items });
}
