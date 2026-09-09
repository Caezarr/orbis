import { id } from "@/lib/ids";

export function ok(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "x-request-id": id("req") },
  });
}

export function fail(message: string, status = 400, code = "BAD_REQUEST") {
  return Response.json(
    {
      code,
      message,
      request_id: id("req"),
      retryable: status >= 500,
    },
    { status },
  );
}
