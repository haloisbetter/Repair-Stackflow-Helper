import type { BackendClient } from "../backend/backend-client.js";
import type { HelperStateMachine } from "./state-machines.js";
import type { CapabilityReport, HeartbeatRequest } from "../contracts/v1/protocol.js";
import { PROTOCOL_VERSION } from "../contracts/v1/protocol.js";
import type { TaskRegistry } from "../tasks/task-registry.js";
import type { HelperHealth } from "../helper/health-service.js";

export interface HeartbeatServiceDeps {
  getIdentity: () => { helperId: string; organizationId?: string; locationId?: string; role: string; appVersion: string; platform: string; architecture: string };
  getHealth: () => HelperHealth | null;
  stateMachine: HelperStateMachine;
  backendClient: BackendClient;
  taskRegistry: TaskRegistry;
  getActiveJobId: () => string | null;
  getJobState: () => "idle" | "claimed" | "running" | "submitting";
  getPendingSubmissionCount: () => number;
  runtimeMode: "development" | "production";
}

export class HeartbeatService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly deps: HeartbeatServiceDeps;
  private lastSuccessfulHeartbeat: string | null = null;
  private consecutiveFailures = 0;

  constructor(deps: HeartbeatServiceDeps) {
    this.deps = deps;
  }

  get lastSuccess(): string | null {
    return this.lastSuccessfulHeartbeat;
  }

  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sendHeartbeat(), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async sendHeartbeat(): Promise<boolean> {
    const identity = this.deps.getIdentity();
    if (!identity.organizationId || !identity.locationId) return false;

    const health = this.deps.getHealth();
    const request: HeartbeatRequest = {
      protocolVersion: PROTOCOL_VERSION,
      helperId: identity.helperId,
      organizationId: identity.organizationId,
      locationId: identity.locationId,
      appVersion: identity.appVersion,
      runtimeMode: this.deps.runtimeMode,
      role: identity.role as "workstation_agent" | "ai_host" | "combined",
      platform: identity.platform,
      architecture: identity.architecture,
      activeProvider: {
        provider: health ? (health.provider as "ollama" | "mock" | "none") : "none",
        status: health ? health.state as "available" | "degraded" | "unavailable" | "timed_out" | "misconfigured" | "unknown" : "unknown",
        modelAvailable: health?.modelAvailable ?? false,
        latencyMs: health?.latencyMs ?? null
      },
      implementedTasks: this.deps.taskRegistry.listEnabled(),
      enabledTasks: this.deps.taskRegistry.listEnabled(),
      activeJobId: this.deps.getActiveJobId(),
      jobState: this.deps.getJobState(),
      queueCapacity: 1,
      pendingSubmissionCount: this.deps.getPendingSubmissionCount(),
      sentAt: new Date().toISOString()
    };

    try {
      await this.deps.backendClient.sendHeartbeat(request);
      this.lastSuccessfulHeartbeat = new Date().toISOString();
      this.consecutiveFailures = 0;
      return true;
    } catch {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 3 && this.deps.stateMachine.isReady()) {
        if (this.deps.stateMachine.canTransition("degraded")) {
          this.deps.stateMachine.transition("degraded");
        }
      }
      return false;
    }
  }

  buildCapabilityReport(): CapabilityReport {
    const identity = this.deps.getIdentity();
    const enabled = this.deps.taskRegistry.listEnabled();
    return {
      protocolVersion: PROTOCOL_VERSION,
      helperId: identity.helperId,
      organizationId: identity.organizationId ?? "",
      locationId: identity.locationId ?? "",
      implementedTasks: enabled,
      enabledTasks: enabled,
      supportedTaskSchemaVersions: { format_technician_note: "1.0" },
      executionTargets: ["local_on_this_machine"],
      providers: ["ollama", "mock"],
      models: ["llama3.2"],
      maxPayloadBytes: 16384,
      maxResponseBytes: 16384,
      reportedAt: new Date().toISOString()
    };
  }
}
