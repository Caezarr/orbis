import {describe,expect,it} from "vitest";
import {validateCompanyAnalysis} from "./company-analysis";
import {buildProfile} from "./profile";
const proposal={name:"Example",summary:"We manage furnished apartments for travelers.",facts:[{quote:"We manage furnished apartments"}],questions:[],workflows:[{id:"rental-operations",reason:"Rental management"}]};
describe("company analysis grounding",()=>{
 it("accepts quotes from supplied evidence",()=>expect(validateCompanyAnalysis(proposal,"We manage furnished apartments for travelers.").name).toBe("Example"));
 it("rejects fabricated facts",()=>expect(()=>validateCompanyAnalysis(proposal,"We sell shoes.")).toThrow());
 it("rejects invented workflows",()=>expect(()=>validateCompanyAnalysis({...proposal,workflows:[{id:"invented",reason:"x"}]},"We manage furnished apartments")).toThrow());
 it("does not turn construction keywords into a fabricated Acme profile",()=>{
   const profile=buildProfile("We handle construction projects in Lyon.","tenant-a");
   expect(profile.tenantId).toBe("tenant-a");
   expect(profile.name).not.toBe("Acme");
   expect(profile.summary).toBe("We handle construction projects in Lyon.");
   expect(profile.size).toBeUndefined();
 });
});
