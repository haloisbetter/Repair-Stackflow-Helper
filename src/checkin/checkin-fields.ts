import { z } from "zod";

export const CHECKIN_FIELD_SCHEMA_VERSION = "1.0" as const;

export const PasscodeHandlingStatus = z.enum([
  "not_requested",
  "customer_will_enter",
  "provided_through_approved_secure_flow",
  "not_available",
  "not_required"
]);
export type PasscodeHandlingStatus = z.infer<typeof PasscodeHandlingStatus>;

export const UrgencyLevel = z.enum(["normal", "urgent", "rush"]);
export type UrgencyLevel = z.infer<typeof UrgencyLevel>;

export const PreferredContactMethod = z.enum(["phone", "email", "sms", "in_person"]);
export type PreferredContactMethod = z.infer<typeof PreferredContactMethod>;

export const CheckInCustomerFields = z.object({
  firstName: z.string().min(1).max(128).optional(),
  lastName: z.string().min(1).max(128).optional(),
  phone: z.string().min(1).max(32).optional(),
  email: z.string().min(1).max(256).optional(),
  preferredContactMethod: PreferredContactMethod.optional()
}).strict();
export type CheckInCustomerFields = z.infer<typeof CheckInCustomerFields>;

export const CheckInDeviceFields = z.object({
  deviceCategory: z.enum(["laptop", "desktop", "phone", "tablet", "watch", "other"]).optional(),
  manufacturer: z.string().min(1).max(128).optional(),
  model: z.string().min(1).max(256).optional(),
  serialNumber: z.string().min(1).max(128).optional(),
  color: z.string().min(1).max(64).optional(),
  operatingSystem: z.string().min(1).max(128).optional(),
  carrier: z.string().min(1).max(128).optional()
}).strict();
export type CheckInDeviceFields = z.infer<typeof CheckInDeviceFields>;

export const CheckInRepairIntakeFields = z.object({
  customerReportedIssue: z.string().min(1).max(2048).optional(),
  whenIssueStarted: z.string().min(1).max(256).optional(),
  frequency: z.string().min(1).max(128).optional(),
  triggeringEvent: z.string().min(1).max(512).optional(),
  troubleshootingAlreadyTried: z.string().min(1).max(2048).optional(),
  priorRepairHistory: z.string().min(1).max(1024).optional(),
  liquidExposure: z.enum(["none", "minor", "major", "unknown"]).optional(),
  physicalDamage: z.string().min(1).max(512).optional(),
  dataImportance: z.enum(["critical", "important", "low", "unknown"]).optional(),
  backupStatus: z.enum(["confirmed", "not_confirmed", "unknown"]).optional(),
  powerState: z.enum(["powers_on", "no_power", "intermittent", "unknown"]).optional(),
  accessoriesReceived: z.array(z.string().min(1).max(128)).max(20).optional(),
  chargerReceived: z.boolean().optional(),
  caseReceived: z.boolean().optional(),
  passcodeHandlingStatus: PasscodeHandlingStatus.optional(),
  findMyStatus: z.enum(["enabled", "disabled", "unknown", "not_applicable"]).optional(),
  authorizationAcknowledged: z.boolean().optional()
}).strict();
export type CheckInRepairIntakeFields = z.infer<typeof CheckInRepairIntakeFields>;

export const CheckInOperationalFields = z.object({
  urgency: UrgencyLevel.optional(),
  requestedService: z.string().min(1).max(256).optional(),
  employeeNotes: z.string().min(1).max(4096).optional()
}).strict();
export type CheckInOperationalFields = z.infer<typeof CheckInOperationalFields>;

export const CheckInFieldSet = z.object({
  customer: CheckInCustomerFields,
  device: CheckInDeviceFields,
  repairIntake: CheckInRepairIntakeFields,
  operational: CheckInOperationalFields
}).strict();
export type CheckInFieldSet = z.infer<typeof CheckInFieldSet>;

export const ALL_CHECKIN_FIELDS = [
  "customer.firstName", "customer.lastName", "customer.phone", "customer.email", "customer.preferredContactMethod",
  "device.deviceCategory", "device.manufacturer", "device.model", "device.serialNumber", "device.color", "device.operatingSystem", "device.carrier",
  "repairIntake.customerReportedIssue", "repairIntake.whenIssueStarted", "repairIntake.frequency", "repairIntake.triggeringEvent",
  "repairIntake.troubleshootingAlreadyTried", "repairIntake.priorRepairHistory", "repairIntake.liquidExposure", "repairIntake.physicalDamage",
  "repairIntake.dataImportance", "repairIntake.backupStatus", "repairIntake.powerState", "repairIntake.accessoriesReceived",
  "repairIntake.chargerReceived", "repairIntake.caseReceived", "repairIntake.passcodeHandlingStatus", "repairIntake.findMyStatus",
  "repairIntake.authorizationAcknowledged",
  "operational.urgency", "operational.requestedService", "operational.employeeNotes"
] as const;

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
