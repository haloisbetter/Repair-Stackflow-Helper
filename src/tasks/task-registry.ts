import { ProtocolError } from "../contracts/v1/errors.js";
import type { ApprovedTask } from "../contracts/v1/common.js";
import { isApproved, isEnabled, ENABLED_TASKS } from "./approved-task.js";
import type { TaskTemplate } from "./format-technician-note/prompt-template.js";
import type { ToolRegistry } from "../tools/tool-registry.js";

export interface TaskRegistryEntry {
  task: ApprovedTask;
  enabled: boolean;
  template: TaskTemplate;
  toolId: string;
  implemented: boolean;
}

export class TaskRegistry {
  constructor(
    private readonly templates: Map<ApprovedTask, TaskTemplate>,
    private readonly toolRegistry?: ToolRegistry
  ) {}

  resolve(task: string): TaskRegistryEntry {
    if (!isApproved(task)) {
      throw new ProtocolError("task_not_approved_in_v1", `Task '${task}' is not an approved task type.`, false);
    }
    const approved = task as ApprovedTask;
    if (!isEnabled(approved)) {
      throw new ProtocolError("task_not_enabled", `Task '${approved}' is reserved but not enabled in this MVP.`, false);
    }
    const template = this.templates.get(approved);
    if (!template) {
      throw new ProtocolError("task_not_enabled", `No template registered for '${approved}'.`, false);
    }
    const tool = this.toolRegistry?.resolve(approved);
    return {
      task: approved,
      enabled: true,
      template,
      toolId: approved,
      implemented: tool?.implemented ?? true
    };
  }

  listEnabled(): ApprovedTask[] {
    return Array.from(ENABLED_TASKS);
  }
}

export function isTaskRegistryEntry(value: unknown): value is TaskRegistryEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "task" in value &&
    "enabled" in value &&
    "template" in value
  );
}
