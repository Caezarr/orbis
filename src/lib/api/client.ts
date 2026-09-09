export type WorkspaceSnapshot = Awaited<ReturnType<typeof loadWorkspace>>;

export async function loadWorkspace() {
  const res = await fetch("/api/v1/workspace", { cache: "no-store" });
  if (!res.ok) throw new Error("Workspace unavailable");
  return res.json();
}

export async function postJson<T>(url: string, body: unknown, headers?: HeadersInit): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Request failed");
  return data as T;
}
