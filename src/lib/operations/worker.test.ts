import {beforeEach,describe,expect,it,vi} from "vitest";
const mock=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn(),configured:true}));
vi.mock("@/lib/platform/db",()=>({transaction:mock.transaction,setTenantContext:vi.fn()}));
vi.mock("@/lib/runtime/provider",()=>({providerStatus:()=>({configured:mock.configured}),getModel:vi.fn()}));
import {runOneTask} from "./worker";
import type {TaskOutput} from "./domain";
const identity={userId:"user",workspaceId:"workspace",tenantId:"tenant"};
beforeEach(()=>{
 vi.resetAllMocks();mock.configured=true;
 mock.transaction.mockImplementation(fn=>fn({query:mock.query}));
 mock.query.mockImplementation(async(sql:string)=>{
  if(sql.startsWith("SELECT 1 FROM memberships"))return{rowCount:1,rows:[{}]};
  if(sql.startsWith("SELECT * FROM operational_tasks"))return{rows:[{id:"task"}]};
  if(sql.includes("attempts=attempts+1"))return{rows:[{id:"task",lease_token:"lease",input:{text:"request"}}]};
  return{rows:[],rowCount:1};
 });
});
describe("durable read-only worker",()=>{
 it("does not claim work without model configuration",async()=>{
  mock.configured=false;await expect(runOneTask(identity,vi.fn())).rejects.toThrow();expect(mock.query).not.toHaveBeenCalled();
 });
 it("verifies membership before reading a task",async()=>{
  mock.query.mockResolvedValue({rows:[],rowCount:0});await expect(runOneTask(identity,vi.fn())).rejects.toThrow("Worker membership required");
 });
 it("does nothing when another worker holds the available tasks",async()=>{
  mock.query.mockImplementation(async(sql:string)=>({rowCount:1,rows:sql.startsWith("SELECT 1")?[{}]:[]}));
  const generate=vi.fn();expect(await runOneTask(identity,generate)).toEqual({processed:false});expect(generate).not.toHaveBeenCalled();
 });
 it("marks failed preparation non-billable without accepting output",async()=>{
  await runOneTask(identity,vi.fn().mockRejectedValue(new Error("provider key must never leak")));
  const update=mock.query.mock.calls.find(([sql])=>sql.includes("output=$4"));
  expect(update?.[1][2]).toBe("failed");expect(JSON.stringify(update)).not.toContain("provider key");
  expect(update?.[0]).toContain("lease_token=$2");
 });
 it("leaves a generated result for review, never auto-accepts",async()=>{
  const output:TaskOutput={title:"Draft",body:"Prepared work",unknowns:[],citations:[],checks:[],usage:{inputTokens:1,outputTokens:1}};
  await runOneTask(identity,vi.fn().mockResolvedValue(output));
  const update=mock.query.mock.calls.find(([sql])=>sql.includes("output=$4"));
  expect(update?.[1][2]).toBe("needs_review");
  expect(mock.query.mock.calls.some(([sql])=>sql.includes("INSERT INTO operational_acceptances"))).toBe(false);
 });
});
