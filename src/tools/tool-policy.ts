import { z } from "zod";
import { OrganizationId } from "../contracts/v1/common.js";
import { ToolRoleSchema } from "../tools/tool-authorization-service.js";

export const ToolPolicyInput = z
  .object({
    organizationId: OrganizationId,
    toolId: z.string().min(1).max(128),
    enabled: z.boolean(),
    allowedRoles: z.array(ToolRoleSchema).min(0).max(5),
    requiresConfirmation: z.boolean(),
    executionLocation: z.enum(["local", "repair_stackflow", "hybrid"])
  })
  .strict();

export type ToolPolicyInput = z.infer<typeof ToolPolicyInput>;
