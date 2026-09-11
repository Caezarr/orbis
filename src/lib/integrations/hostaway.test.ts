import { describe, it, expect, vi } from "vitest";
import { previewHostawayReservations } from "./hostaway";
describe("Hostaway read-only preview", () => {
  it("uses fixed endpoints and removes guest PII", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "test-token" }))
      .mockResolvedValueOnce(
        Response.json({
          status: "success",
          result: [
            {
              id: 1,
              listingMapId: 7,
              arrivalDate: "2026-10-01",
              departureDate: "2026-10-02",
              status: "new",
              guestEmail: "private@example.com",
            },
          ],
        }),
      );
    const result = await previewHostawayReservations(
      { accountId: "test", clientSecret: "test", listingId: 7 },
      transport,
    );
    expect(result.reservations[0]).not.toHaveProperty("guestEmail");
    expect(transport.mock.calls[1][0]).toBe(
      "https://api.hostaway.com/v1/reservations?limit=50&listingId=7",
    );
    expect(result.readOnly).toBe(true);
  });
  it("rejects cross-property responses", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "test" }))
      .mockResolvedValueOnce(
        Response.json({
          status: "success",
          result: [
            {
              id: 1,
              listingMapId: 8,
              arrivalDate: "2026-10-01",
              departureDate: "2026-10-02",
              status: "new",
            },
          ],
        }),
      );
    await expect(
      previewHostawayReservations(
        { accountId: "test", clientSecret: "test", listingId: 7 },
        transport,
      ),
    ).rejects.toThrow("outside");
  });
});
