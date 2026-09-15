import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { publicAddress, publicWebsite } from "@/lib/runtime/company-site";

/** Only called with a broker-returned download URL, never a browser-supplied URL.
 * No credentials forwarded. Validate and pin every DNS hop, bound time and bytes.
 */
export async function downloadText(raw: string): Promise<string> {
  const signal = AbortSignal.timeout(10000);
  let url = publicWebsite(raw);
  for (let hop = 0; hop < 4; hop++) {
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true }),
      new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new Error("Download timed out"));
        else
          signal.addEventListener(
            "abort",
            () => reject(new Error("Download timed out")),
            { once: true },
          );
      }),
    ]);
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new Error("Non-public download refused");
    const address = addresses[0];
    const result = await new Promise<{ text?: string; location?: string }>(
      (resolve, reject) => {
        const req = request(
          url,
          {
            signal,
            headers: { "Accept-Encoding": "identity" },
            lookup: (_host, options, callback) => {
              if (options.all) callback(null, [address]);
              else callback(null, address.address, address.family);
            },
          },
          (res) => {
            res.on("error", reject);
            if (
              [301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
              res.headers.location
            ) {
              const location = res.headers.location;
              res.destroy();
              resolve({ location });
              return;
            }
            if (
              res.statusCode !== 200 ||
              (res.headers["content-encoding"] &&
                res.headers["content-encoding"] !== "identity")
            ) {
              res.destroy();
              reject(new Error("Download unavailable"));
              return;
            }
            let size = 0;
            const chunks: Buffer[] = [];
            res.on("data", (chunk) => {
              size += chunk.length;
              if (size > 2000000) {
                res.destroy(new Error("File exceeds limit"));
                return;
              }
              chunks.push(Buffer.from(chunk));
            });
            res.on("end", () => {
              try {
                resolve({
                  text: new TextDecoder("utf-8", { fatal: true }).decode(
                    Buffer.concat(chunks),
                  ),
                });
              } catch {
                reject(new Error("Choose a UTF-8 text export"));
              }
            });
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
    if (result.location) {
      url = publicWebsite(new URL(result.location, url).href);
      continue;
    }
    return result.text ?? "";
  }
  throw new Error("Too many download redirects");
}
