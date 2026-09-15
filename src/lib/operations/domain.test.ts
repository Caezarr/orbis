import {describe,expect,it} from "vitest";
import {enqueueSchema,publicTask,type TaskRow} from "./domain";
const row:TaskRow={id:"task",total_cents:150,workspace_id:"workspace",tenant_id:"tenant",created_by:"user",request_hash:"hash",attempts:1,lease_token:null,lease_until:null,input:{missionId:"mission",packageSlug:"request-analysis",contextHash:"context",text:"Prepare reply",objective:"Reply",instructions:"Use sources",rules:[],memory:[],sources:[]},workflow_id:"rental-operations",task_id:"read-only:request-analysis",title:"Guest reply",status:"needs_review",created_at:new Date("2026-09-14T10:00:00Z"),completed_at:null,ready_at:new Date("2026-09-14T10:01:00Z"),output:{title:"Reply",body:"Draft",citations:[],unknowns:[],checks:[],usage:{inputTokens:10,outputTokens:10}},quote:{workflowId:"rental-operations",taskId:"read-only:request-analysis",quantity:1,currency:"EUR",unitPriceCents:150,totalCents:150,rateVersion:"test",billableOutcome:"completed_task"},error:null};
describe("operational task contract",()=>{
 it("requires explicit quote acceptance",()=>{
  expect(enqueueSchema.safeParse({missionId:"mission",workflowId:"rental-operations",text:"Prepare a guest response"}).success).toBe(false);
  expect(enqueueSchema.safeParse({missionId:"mission",workflowId:"rental-operations",text:"Prepare a guest response",expectedTotalCents:150,expectedRateVersion:"v1",tenantId:"attacker"}).success).toBe(false);
 });
 it("does not count unaccepted work as billable",()=>{
  expect(publicTask(row).billable).toBe(false);
  expect(publicTask({...row,status:"failed"}).billable).toBe(false);
 });
 it("binds review token to exact result and price",()=>{
  const before=publicTask(row).reviewToken;
  expect(publicTask({...row,quote:{...row.quote,totalCents:200}}).reviewToken).not.toBe(before);
  expect(publicTask({...row,output:{...row.output!,body:"Changed"}}).reviewToken).not.toBe(before);
  expect(publicTask(row).reviewToken).toBe(before);
 });
});
