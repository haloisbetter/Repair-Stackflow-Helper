import { z } from "zod";

export const SCHEMA_VERSION = "1.0" as const;
export type SchemaVersion = typeof SCHEMA_VERSION;

export const IsoTimestamp = z.string().datetime({ offset: true });
export type IsoTimestamp = z.infer<typeof IsoTimestamp>;

export const Uuid = z.string().uuid();
export type Uuid = z.infer<typeof Uuid>;

export const ApprovedTask = z.enum([
  "health_check",
  "format_technician_note",
  "draft_customer_update",
  "extract_guided_checkin_fields",
  "summarize_checkin_symptoms"
]);
export type ApprovedTask = z.infer<typeof ApprovedTask>;

export const OrganizationId = z.string().min(1).max(128);
export type OrganizationId = z.infer<typeof OrganizationId>;

export const LocationId = z.string().min(1).max(128);
export type LocationId = z.infer<typeof LocationId>;

export const HelperId = z.string().uuid();
export type HelperId = z.infer<typeof HelperId>;
