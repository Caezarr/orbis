import { z } from "zod";
export const rentalEventSchema = z
  .object({
    eventId: z.string().min(1),
    kind: z.enum([
      "reservation_created",
      "reservation_updated",
      "reservation_cancelled",
      "guest_message",
    ]),
    reservationId: z.string().min(1),
    propertyId: z.string().min(1),
    arrivalAt: z.string().datetime({ offset: true }),
    departureAt: z.string().datetime({ offset: true }),
    message: z.string().optional(),
    urgent: z.boolean().default(false),
  })
  .refine(
    (e) => Date.parse(e.departureAt) > Date.parse(e.arrivalAt),
    "Departure must follow arrival",
  );
export type PropertyPolicy = {
  id: string;
  guideVersion: string;
  cleanerId?: string;
  emergencyContact?: string;
  allowDrafts: boolean;
};
export type RentalAction = {
  key: string;
  kind:
    | "prepare_arrival"
    | "assign_turnover"
    | "review_message"
    | "escalate"
    | "cancel_scheduled_work";
  reservationId: string;
  propertyId: string;
  dueAt?: string;
  reason: string;
  requiresApproval: true;
};
// Pure event planner, used before dispatch. No side effects or claims that an action ran.
export function planRentalEvent(
  raw: unknown,
  properties: PropertyPolicy[],
  processedKeys: string[] = [],
): RentalAction[] {
  const e = rentalEventSchema.parse(raw);
  const key = `${e.propertyId}:${e.reservationId}:${e.eventId}`;
  if (processedKeys.includes(key)) return [];
  const property = properties.find((p) => p.id === e.propertyId);
  const action = (
    kind: RentalAction["kind"],
    reason: string,
    dueAt?: string,
  ): RentalAction => ({
    key: `${e.propertyId}:${e.reservationId}:${kind}`,
    kind,
    reason,
    dueAt,
    reservationId: e.reservationId,
    propertyId: e.propertyId,
    requiresApproval: true,
  });
  if (!property)
    return [
      action(
        "escalate",
        "Property is outside the selected portfolio. Do not access another property’s guide.",
      ),
    ];
  if (e.kind === "reservation_cancelled")
    return [
      action(
        "cancel_scheduled_work",
        "Review and cancel unsent arrival/turnover work for this reservation; never cancel the booking itself.",
      ),
    ];
  if (e.urgent)
    return [
      action(
        "escalate",
        property.emergencyContact
          ? `Urgent case: notify ${property.emergencyContact}. No automated advice.`
          : "Urgent case: emergency contact is missing. Owner action required.",
      ),
    ];
  if (!property.guideVersion)
    return [action("escalate", "An approved property guide is required.")];
  if (e.kind === "guest_message")
    return [
      action(
        "review_message",
        "Retrieve the current conversation and this property’s approved guide before preparing a reply.",
      ),
    ];
  const result: RentalAction[] = [];
  if (property.allowDrafts)
    result.push(
      action(
        "prepare_arrival",
        `Prepare only from guide ${property.guideVersion}; no access codes in the draft.`,
        new Date(Date.parse(e.arrivalAt) - 48 * 3600000).toISOString(),
      ),
    );
  else
    result.push(
      action(
        "escalate",
        "Owner approval is required before arrival preparation.",
      ),
    );
  result.push(
    property.cleanerId
      ? action(
          "assign_turnover",
          `Propose assignment to ${property.cleanerId}; require acknowledgement and completion evidence.`,
          e.departureAt,
        )
      : action("escalate", "No cleaner is assigned to this property."),
  );
  return result;
}
