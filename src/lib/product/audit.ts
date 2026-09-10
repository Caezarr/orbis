import { z } from "zod";
import { departments } from "./catalog";
export const auditSchema = z.object({
  seats: z.number().int().min(1).max(50).optional(),
  website: z.string().url().max(2000).optional(),
  company: z.string().trim().min(2).max(120),
  description: z.string().trim().min(20).max(4000),
  department: z.string().refine((v) => departments.includes(v)),
  tools: z.string().max(1000),
  volume: z.string().trim().min(2).max(400),
  success: z.string().trim().min(10).max(1200),
  constraints: z.string().max(2000),
  budget: z.number().int().min(0).max(100000),
  audience: z.enum(["company", "integrator"]),
});
export type AuditInput = z.infer<typeof auditSchema>;
export type BusinessAudit = AuditInput & {
  id: string;
  tenantId: string;
  createdAt: string;
  installations: {
    flowId: string;
    missionId: string;
    sourcing: Record<string, "own" | "managed" | "later">;
  }[];
};
