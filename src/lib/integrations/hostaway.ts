import { z } from "zod";
const tokenSchema = z.object({ access_token: z.string().min(1) });
const reservationSchema = z.object({
  id: z.number(),
  listingMapId: z.number(),
  arrivalDate: z.string(),
  departureDate: z.string(),
  status: z.string(),
});
// Read-only, bounded preview. No arbitrary URLs and no guest PII in the returned snapshot.
export async function previewHostawayReservations(
  input: { accountId: string; clientSecret: string; listingId: number },
  transport: typeof fetch = fetch,
) {
  const auth = await transport("https://api.hostaway.com/v1/accessTokens", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: input.accountId,
      client_secret: input.clientSecret,
      scope: "general",
    }),
    signal: AbortSignal.timeout(15000),
    redirect: "error",
    cache: "no-store",
  });
  if (!auth.ok) throw new Error("Hostaway authentication failed.");
  const { access_token } = tokenSchema.parse(await auth.json());
  const response = await transport(
    `https://api.hostaway.com/v1/reservations?limit=50&listingId=${input.listingId}`,
    {
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      cache: "no-store",
    },
  );
  if (response.status === 429)
    throw new Error(
      "Hostaway rate limit reached. Retry later; no write was performed.",
    );
  if (!response.ok) throw new Error("Hostaway reservations could not be read.");
  const data = z
    .object({
      status: z.literal("success"),
      result: z.array(reservationSchema),
    })
    .parse(await response.json());
  if (data.result.some((r) => r.listingMapId !== input.listingId))
    throw new Error(
      "Hostaway returned a reservation outside the selected property.",
    );
  return {
    reservations: data.result,
    possiblyMore: data.result.length >= 50,
    readOnly: true as const,
  };
}
