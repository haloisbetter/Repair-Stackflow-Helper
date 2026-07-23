/**
 * Versioned schema contracts for the draft_customer_update task.
 *
 * This tool creates a draft customer-facing message based only on
 * confirmed source facts. It never sends a message.
 */
import { z } from "zod";

export const DRAFT_CUSTOMER_UPDATE_TASK_VERSION = "1.0" as const;
export const DRAFT_CUSTOMER_UPDATE_INPUT_SCHEMA_VERSION = "1.0" as const;
export const DRAFT_CUSTOMER_UPDATE_OUTPUT_SCHEMA_VERSION = "1.0" as const;
export const DRAFT_CUSTOMER_UPDATE_PROMPT_VERSION = "1.0" as const;

export const ConfirmationLevel = z.enum(["confirmed", "unconfirmed", "internal_only", "unknown"]);
export type ConfirmationLevel = z.infer<typeof ConfirmationLevel>;

export const CustomerUpdateInputFact = z.object({
  value: z.string().min(1).max(1024),
  confirmationLevel: ConfirmationLevel
}).strict();
export type CustomerUpdateInputFact = z.infer<typeof CustomerUpdateInputFact>;

export const DraftCustomerUpdateInput = z.object({
  customerFirstName: z.string().min(1).max(128).optional(),
  deviceDescription: z.string().min(1).max(256).optional(),
  repairStatus: z.string().min(1).max(256).optional(),
  confirmedDiagnosis: CustomerUpdateInputFact.optional(),
  confirmedWorkPerformed: CustomerUpdateInputFact.optional(),
  confirmedEstimate: CustomerUpdateInputFact.optional(),
  confirmedApprovalState: CustomerUpdateInputFact.optional(),
  confirmedPartStatus: CustomerUpdateInputFact.optional(),
  confirmedCompletionState: CustomerUpdateInputFact.optional(),
  requiredCustomerAction: z.string().min(1).max(1024).optional(),
  nextExpectedStep: z.string().min(1).max(1024).optional(),
  employeeNotesSafeForCustomer: z.string().min(1).max(2048).optional(),
  communicationChannel: z.enum(["sms", "email", "phone_call", "in_person"]).default("sms"),
  requestedTone: z.enum(["professional", "friendly", "neutral"]).default("professional"),
  organizationInstructions: z.string().min(1).max(2000).optional()
}).strict();
export type DraftCustomerUpdateInput = z.infer<typeof DraftCustomerUpdateInput>;

export const DraftCustomerUpdateOutput = z.object({
  customerFacingDraft: z.string().min(1).max(2048),
  subjectLine: z.string().min(0).max(256).optional(),
  communicationChannel: z.enum(["sms", "email", "phone_call", "in_person"]),
  confirmedFactsUsed: z.array(z.string().min(1).max(512)).max(32),
  factsExcluded: z.array(z.string().min(1).max(512)).max(32),
  requiredCustomerAction: z.string().min(0).max(1024),
  nextStep: z.string().min(0).max(1024),
  warnings: z.array(z.string().min(1).max(1024)).max(32),
  uncertainOrMissingInformation: z.array(z.string().min(1).max(1024)).max(32),
  prohibitedClaimsAvoided: z.array(z.string().min(1).max(512)).max(32)
}).strict();
export type DraftCustomerUpdateOutput = z.infer<typeof DraftCustomerUpdateOutput>;
