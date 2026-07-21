import type { ApprovedTask } from "../contracts/v1/common.js";

export const APPROVED_TASKS: ReadonlySet<ApprovedTask> = new Set([
  "health_check",
  "format_technician_note",
  "draft_customer_update"
]);

export const ENABLED_TASKS: ReadonlySet<ApprovedTask> = new Set(["format_technician_note"]);

export function isApproved(task: string): task is ApprovedTask {
  return APPROVED_TASKS.has(task as ApprovedTask);
}

export function isEnabled(task: ApprovedTask): boolean {
  return ENABLED_TASKS.has(task);
}
