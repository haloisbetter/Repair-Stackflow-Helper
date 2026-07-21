export type ModelRole = "technician_note_formatter" | "customer_update_drafter" | "health_checker";

export interface ModelRoleBinding {
  role: ModelRole;
  approvedModel: string;
  minContext: number;
}

const DEFAULT_BINDINGS: Record<ModelRole, ModelRoleBinding> = {
  technician_note_formatter: {
    role: "technician_note_formatter",
    approvedModel: "llama3.2",
    minContext: 4096
  },
  customer_update_drafter: {
    role: "customer_update_drafter",
    approvedModel: "llama3.2",
    minContext: 4096
  },
  health_checker: {
    role: "health_checker",
    approvedModel: "llama3.2",
    minContext: 2048
  }
};

export function resolveModelForRole(role: ModelRole, override?: string): string {
  if (override && override.trim().length > 0) return override;
  return DEFAULT_BINDINGS[role].approvedModel;
}

export function listModelRoles(): ModelRole[] {
  return Object.keys(DEFAULT_BINDINGS) as ModelRole[];
}
