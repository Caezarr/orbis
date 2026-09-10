/** CSRF / accidental-public-host guard for the local pilot. NOT authentication. */
export function isLocalMutation(request: Request) {
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
