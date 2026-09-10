import { describe, expect, it } from "vitest";
import { isLocalMutation } from "./local-request";
describe("local paid-call guard", () => {
  it("allows a same-origin localhost request", () =>
    expect(
      isLocalMutation(
        new Request("http://127.0.0.1:3002/api", {
          headers: { origin: "http://127.0.0.1:3002" },
        }),
      ),
    ).toBe(true));
  it("rejects cross-origin and missing-origin requests", () => {
    expect(
      isLocalMutation(
        new Request("http://localhost:3002/api", {
          headers: { origin: "https://other.test" },
        }),
      ),
    ).toBe(false);
    expect(isLocalMutation(new Request("http://localhost:3002/api"))).toBe(
      false,
    );
  });
  it("rejects public hosts and forwarded requests", () => {
    expect(
      isLocalMutation(
        new Request("https://public.test/api", {
          headers: { origin: "https://public.test" },
        }),
      ),
    ).toBe(false);
    expect(
      isLocalMutation(
        new Request("http://localhost:3002/api", {
          headers: {
            origin: "http://localhost:3002",
            "x-forwarded-host": "public.test",
          },
        }),
      ),
    ).toBe(false);
  });
});
