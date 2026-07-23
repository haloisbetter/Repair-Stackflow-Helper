/**
 * Production runtime coordinator. Orchestrates:
 * - Credential loading
 * - Pairing state management
 * - Backend connectivity
 * - Heartbeat scheduling
 * - Capability reporting
 * - Claim loop lifecycle
 * - Active job ownership
 * - Pending submission processing
 * - Shutdown
 */
import { HelperStateMachine, type HelperState } from "./state-machines.js";
import { HeartbeatService, type HeartbeatServiceDeps } from "./heartbeat-service.js";
import { ClaimLoop, DEFAULT_CLAIM_LOOP_CONFIG, type ClaimLoopConfig, type ClaimLoopDeps } from "./claim-loop.js";
import type { PendingSubmissionStore } from "./pending-submission-store.js";
import type { BackendClient } from "../backend/backend-client.js";
import type { CredentialStore, StoredCredential } from "../backend/credential-store.js";
import type { TaskRegistry } from "../tasks/task-registry.js";
import type { JobRunner } from "../jobs/job-runner.js";
import type { HelperHealth } from "../helper/health-service.js";
import { PROTOCOL_VERSION } from "../contracts/v1/protocol.js";

export interface RuntimeCoordinatorConfig {
  mode: "development" | "production";
  heartbeatIntervalMs: number;
  claimLoop: ClaimLoopConfig;
  backendBaseUrl: string;
  backendTimeoutMs: number;
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeCoordinatorConfig = {
  mode: "development",
  heartbeatIntervalMs: 30_000,
  claimLoop: DEFAULT_CLAIM_LOOP_CONFIG,
  backendBaseUrl: "http://127.0.0.1:8787",
  backendTimeoutMs: 15_000
};

export interface RuntimeCoordinatorDeps {
  backendClient: BackendClient;
  credentialStore: CredentialStore;
  pendingStore: PendingSubmissionStore;
  taskRegistry: TaskRegistry;
  jobRunner: JobRunner;
  getIdentity: () => { helperId: string; organizationId?: string; locationId?: string; role: string; appVersion: string; platform: string; architecture: string };
  getHealth: () => HelperHealth | null;
  getAssistantProfileVersion: () => number;
  getInstructionProfileVersion: () => number;
  getToolPolicyVersion: () => number;
  onStateChange?: (from: HelperState, to: HelperState) => void;
}

export interface RuntimeStatus {
  mode: "development" | "production";
  helperState: HelperState;
  credentialPresent: boolean;
  credentialStatus: "valid" | "expired" | "revoked" | "absent";
  lastHeartbeat: string | null;
  activeJobId: string | null;
  activeJobState: string | null;
  pendingSubmissions: number;
  claimLoopRunning: boolean;
  protocolVersion: string;
}

export class RuntimeCoordinator {
  readonly helperState: HelperStateMachine;
  private readonly heartbeatService: HeartbeatService;
  private readonly claimLoop: ClaimLoop;
  private readonly deps: RuntimeCoordinatorDeps;
  private readonly config: RuntimeCoordinatorConfig;
  private credential: StoredCredential | null = null;
  private started = false;

  constructor(deps: RuntimeCoordinatorDeps, config: RuntimeCoordinatorConfig = DEFAULT_RUNTIME_CONFIG) {
    this.deps = deps;
    this.config = config;
    this.helperState = new HelperStateMachine("unconfigured");

    if (deps.onStateChange) {
      this.helperState.onChange(deps.onStateChange);
    }

    const heartbeatDeps: HeartbeatServiceDeps = {
      getIdentity: deps.getIdentity,
      getHealth: deps.getHealth,
      stateMachine: this.helperState,
      backendClient: deps.backendClient,
      taskRegistry: deps.taskRegistry,
      getActiveJobId: () => this.claimLoop.activeJobId,
      getJobState: () => this.claimLoop.jobState,
      getPendingSubmissionCount: () => 0,
      runtimeMode: config.mode
    };
    this.heartbeatService = new HeartbeatService(heartbeatDeps);

    const claimDeps: ClaimLoopDeps = {
      backendClient: deps.backendClient,
      helperState: this.helperState,
      heartbeatService: this.heartbeatService,
      pendingStore: deps.pendingStore,
      jobRunner: deps.jobRunner,
      taskRegistry: deps.taskRegistry,
      getIdentity: deps.getIdentity,
      getAssistantProfileVersion: deps.getAssistantProfileVersion,
      getInstructionProfileVersion: deps.getInstructionProfileVersion,
      getToolPolicyVersion: deps.getToolPolicyVersion
    };
    this.claimLoop = new ClaimLoop(claimDeps, config.claimLoop);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.credential = await this.deps.credentialStore.loadCredential();

    if (!this.credential) {
      this.helperState.force("unpaired");
      return;
    }

    const now = Date.now();
    const expiresAt = new Date(this.credential.expiresAt).getTime();
    if (expiresAt <= now) {
      this.helperState.force("credential_expired");
      return;
    }

    this.helperState.force("paired");
    this.helperState.transition("connecting");

    try {
      await this.deps.backendClient.sendHeartbeat({
        protocolVersion: PROTOCOL_VERSION,
        helperId: this.credential.helperId,
        organizationId: this.credential.organizationId,
        locationId: this.credential.locationId,
        appVersion: this.deps.getIdentity().appVersion,
        runtimeMode: this.config.mode,
        role: this.credential.role as "workstation_agent" | "ai_host" | "combined",
        platform: this.deps.getIdentity().platform,
        architecture: this.deps.getIdentity().architecture,
        activeProvider: { provider: "none", status: "unknown", modelAvailable: false, latencyMs: null },
        implementedTasks: this.deps.taskRegistry.listEnabled(),
        enabledTasks: this.deps.taskRegistry.listEnabled(),
        activeJobId: null,
        jobState: "idle",
        queueCapacity: 1,
        pendingSubmissionCount: 0,
        sentAt: new Date().toISOString()
      });
      this.helperState.transition("ready");
    } catch {
      if (this.helperState.canTransition("degraded")) {
        this.helperState.transition("degraded");
      } else {
        this.helperState.force("degraded");
      }
    }

    this.heartbeatService.start(this.config.heartbeatIntervalMs);

    if (this.config.mode === "production") {
      this.claimLoop.start();
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    this.heartbeatService.stop();
    this.claimLoop.stop();
  }

  async pair(pairingCode: string): Promise<void> {
    const identity = this.deps.getIdentity();
    this.helperState.force("pairing");

    try {
      const response = await this.deps.backendClient.exchangePairingCode({
        protocolVersion: PROTOCOL_VERSION,
        pairingCode,
        helperId: identity.helperId,
        appVersion: identity.appVersion,
        platform: identity.platform,
        architecture: identity.architecture,
        role: identity.role as "workstation_agent" | "ai_host" | "combined",
        requestedAt: new Date().toISOString()
      });

      this.credential = {
        token: response.credentialToken,
        helperId: response.helperId,
        organizationId: response.organizationId,
        locationId: response.locationId,
        role: response.role,
        issuedAt: response.credentialIssuedAt,
        expiresAt: response.credentialExpiresAt
      };
      await this.deps.credentialStore.saveCredential(this.credential);
      this.helperState.transition("paired");

      if (this.helperState.canTransition("ready")) {
        this.helperState.transition("ready");
      }

      this.heartbeatService.start(this.config.heartbeatIntervalMs);
      if (this.config.mode === "production") {
        this.claimLoop.start();
      }
    } catch (e) {
      this.helperState.force("unpaired");
      throw e;
    }
  }

  async unpair(): Promise<void> {
    this.heartbeatService.stop();
    this.claimLoop.stop();
    try {
      if (this.credential) {
        await this.deps.backendClient.revokeCredential(this.credential.helperId);
      }
    } catch { /* best-effort */ }
    await this.deps.credentialStore.clearCredential();
    this.credential = null;
    this.helperState.force("unpaired");
  }

  getToken(): string | null {
    return this.credential?.token ?? null;
  }

  getCredentialStatus(): "valid" | "expired" | "revoked" | "absent" {
    if (!this.credential) return "absent";
    const now = Date.now();
    const expiresAt = new Date(this.credential.expiresAt).getTime();
    if (expiresAt <= now) return "expired";
    return "valid";
  }

  getStatus(): RuntimeStatus {
    return {
      mode: this.config.mode,
      helperState: this.helperState.state,
      credentialPresent: this.credential !== null,
      credentialStatus: this.getCredentialStatus(),
      lastHeartbeat: this.heartbeatService.lastSuccess,
      activeJobId: this.claimLoop.activeJobId,
      activeJobState: this.claimLoop.activeJobState,
      pendingSubmissions: 0,
      claimLoopRunning: this.config.mode === "production" && this.started,
      protocolVersion: PROTOCOL_VERSION
    };
  }

  getCredential(): StoredCredential | null {
    return this.credential;
  }
}
