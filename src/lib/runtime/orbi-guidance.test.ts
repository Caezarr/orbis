import { describe, expect, it } from "vitest";
import { validateGuidance } from "./orbi-guidance";
describe("Orbi recommendation contract", () => {
  it("accepts known workflows or a clarification without workflows", () => {
    expect(validateGuidance({message:"What result do you need?",workflows:[],questions:["Which team?"]}).workflows).toEqual([]);
    expect(validateGuidance({message:"Let's prepare guest replies.",workflows:[{id:"rental-operations",reason:"You manage rentals."}],questions:[]}).workflows).toHaveLength(1);
  });
  it("rejects invented or repeated workflows", () => {
    expect(() => validateGuidance({message:"x",workflows:[{id:"made-up",reason:"x"}],questions:[]})).toThrow();
    expect(() => validateGuidance({message:"x",workflows:[{id:"rental-operations",reason:"x"},{id:"rental-operations",reason:"y"}],questions:[]})).toThrow();
  });
});
