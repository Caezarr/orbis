import { z } from "zod";

export const scopeSchema = z
  .object({
    missionId: z.string().min(1).max(100),
    provider: z.enum(["sharepoint", "notion", "drive"]),
    kind: z.enum([
      "site",
      "subsite",
      "library",
      "folder",
      "page",
      "database",
      "file",
    ]),
    url: z.string().url().max(2000),
    recursive: z.boolean(),
    instructions: z.string().max(2000),
  })
  .superRefine((value, ctx) => {
    const url = new URL(value.url);
    const hosts = {
      sharepoint: /(^|\.)sharepoint\.com$/,
      notion: /(^|\.)(notion\.so|notion\.site)$/,
      drive: /^(drive|docs)\.google\.com$/,
    };
    const kinds = {
      sharepoint: ["site", "subsite", "library", "folder", "file"],
      notion: ["page", "database"],
      drive: ["folder", "file"],
    };
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !hosts[value.provider].test(url.hostname) ||
      url.pathname === "/"
    )
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message:
          "Indiquez le lien HTTPS d’une ressource précise du service choisi.",
      });
    if (!kinds[value.provider].includes(value.kind))
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: "Ce type ne correspond pas au service.",
      });
    if (value.kind === "file" && value.recursive)
      ctx.addIssue({
        code: "custom",
        path: ["recursive"],
        message: "Un fichier ne contient pas de sous-ressources.",
      });
  });
export type KnowledgeSelection = z.infer<typeof scopeSchema> & {
  id: string;
  tenantId: string;
  createdAt: string;
  status: "awaiting_connection";
};
