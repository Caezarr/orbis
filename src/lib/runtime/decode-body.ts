/**
 * Decode a fetched public page with the charset it declares, not always UTF-8.
 *
 * Many small-business sites (old French artisan sites especially) are still
 * served as ISO-8859-1 / windows-1252. Decoding them as UTF-8 turned every
 * accented letter into U+FFFD: « Électricité générale » became
 * « �lectricit� g�n�rale » in the /start profile, the facts and the verbatim
 * citations Orbi quotes back to the owner.
 *
 * Order (a simplified WHATWG "encoding sniffing"): byte-order mark, then the
 * Content-Type charset, then a <meta charset> / http-equiv in the first 1024
 * bytes. Nothing declared: UTF-8 if the bytes are valid UTF-8, else
 * windows-1252 (the web's legacy default for French). A label TextDecoder does
 * not know is ignored, never fatal.
 */
const decoderFor = (label: string | undefined) => {
  if (!label) return undefined;
  try {
    return new TextDecoder(label.trim().replace(/^["']|["']$/g, ""));
  } catch {
    return undefined;
  }
};

const charsetIn = (value: string) => /charset\s*=\s*["']?([\w.:-]+)/i.exec(value)?.[1];

function metaCharset(head: string) {
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const direct = /\bcharset\s*=\s*["']?([\w.:-]+)/i.exec(tag);
    if (direct && !/http-equiv/i.test(tag)) return direct[1];
    if (/http-equiv\s*=\s*["']?content-type/i.test(tag)) {
      const content = /\bcontent\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2];
      const label = content && charsetIn(content);
      if (label) return label;
    }
  }
  return undefined;
}

export function decodeBody(bytes: Uint8Array, contentType: string): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  const declared = decoderFor(charsetIn(contentType));
  if (declared) return declared.decode(bytes);
  // The prescan reads ASCII only, so latin1 is a safe view of the first bytes.
  const sniffed = /html|xml/i.test(contentType) || !contentType
    ? decoderFor(metaCharset(Buffer.from(bytes.subarray(0, 1024)).toString("latin1")))
    : undefined;
  // A page can't declare UTF-16 from inside itself (WHATWG): treat it as UTF-8.
  if (sniffed && !/^utf-16/i.test(sniffed.encoding)) return sniffed.decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
