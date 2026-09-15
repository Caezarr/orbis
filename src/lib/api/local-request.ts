import { isSameOriginMutation } from "@/lib/platform/auth";
import { isOfflineMode, workspaceContext } from "@/lib/platform/context";
/** Legacy guard: production requires an authenticated wrapper AND same origin. */
export function isLocalMutation(request: Request) {
  if (!isOfflineMode()) {
    const context = workspaceContext();
    return !!context && !context.closed && isSameOriginMutation(request);
  }
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const forwardedHost = request.headers.get("x-forwarded-host");
  let origin: URL;
  try {
    origin = new URL(request.headers.get("origin") ?? "");
  } catch {
    return false;
  }
  return (
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    origin.host === host &&
    origin.protocol === url.protocol &&
    (!forwardedHost || forwardedHost === host)
  );
}
