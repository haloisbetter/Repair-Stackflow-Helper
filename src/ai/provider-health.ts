export type ProviderHealthStatus =
  | "available"
  | "unavailable"
  | "model_missing"
  | "timed_out"
  | "misconfigured";

export interface ProviderHealth {
  status: ProviderHealthStatus;
  endpoint: string;
  latencyMs: number | null;
  models: string[];
  checkedAt: string;
  detail?: string;
}

export interface ModelAvailability {
  available: boolean;
  model: string;
}
