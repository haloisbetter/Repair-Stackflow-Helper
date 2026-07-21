import { z } from "zod";
import { OrganizationId } from "../contracts/v1/common.js";

export type ToolRole = "workstation_agent" | "ai_host" | "combined";

export const ToolRoleSchema = z.enum(["workstation_agent", "ai_host", "combined"]);

export const ToolPolicy = z
  .object({
    organizationId: OrganizationId,
    toolId: z.string().min(1).max(128),
    enabled: z.boolean(),
    allowedRoles: z.array(ToolRoleSchema).min(0).max(5),
    requiresConfirmation: z.boolean(),
    executionLocation: z.enum(["local", "repair_stackflow", "hybrid"])
  })
  .strict();

export type ToolPolicy = z.infer<typeof ToolPolicy>;

export type AuthorizationErrorCode =
  | "tool_not_found"
  | "tool_not_implemented"
  | "tool_not_in_profile"
  | "tool_disabled_by_policy"
  | "tool_role_not_allowed"
  | "tool_location_not_supported"
  | "tool_confirmation_required";

export interface AuthorizationDecision {
  authorized: boolean;
  errorCode?: AuthorizationErrorCode;
  reason?: string;
}

const SUPPORTED_LOCATIONS: ReadonlySet<string> = new Set(["local", "hybrid"]);

export function authorizeToolUse(params: {
  toolId: string;
  role: ToolRole;
  toolRegistry: { resolve(id: string): { implemented: boolean } | null };
  enabledTools: readonly string[];
  policy: ToolPolicy;
  confirmationProvided: boolean;
}): AuthorizationDecision {
  const { toolId, role, toolRegistry, enabledTools, policy, confirmationProvided } = params;

  const tool = toolRegistry.resolve(toolId);
  if (!tool) {
    return { authorized: false, errorCode: "tool_not_found", reason: `Unknown tool: ${toolId}` };
  }
  if (!tool.implemented) {
    return { authorized: false, errorCode: "tool_not_implemented", reason: `Tool not implemented: ${toolId}` };
  }
  if (!enabledTools.includes(toolId)) {
    return { authorized: false, errorCode: "tool_not_in_profile", reason: `Tool not enabled in profile: ${toolId}` };
  }
  if (!policy.enabled) {
    return { authorized: false, errorCode: "tool_disabled_by_policy", reason: `Tool disabled by policy: ${toolId}` };
  }
  if (policy.allowedRoles.length > 0 && !policy.allowedRoles.includes(role)) {
    return { authorized: false, errorCode: "tool_role_not_allowed", reason: `Role ${role} not permitted for ${toolId}` };
  }
  if (!SUPPORTED_LOCATIONS.has(policy.executionLocation)) {
    return { authorized: false, errorCode: "tool_location_not_supported", reason: `Execution location ${policy.executionLocation} not supported` };
  }
  if (policy.requiresConfirmation && !confirmationProvided) {
    return { authorized: false, errorCode: "tool_confirmation_required", reason: `Confirmation required for ${toolId}` };
  }
  return { authorized: true };
}
