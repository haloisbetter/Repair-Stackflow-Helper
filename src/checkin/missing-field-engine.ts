import type { CheckInFieldSet } from "./checkin-fields.js";

export interface RequiredFieldConfig {
  field: string;
  question: string;
  deviceCategories?: string[];
  serviceTypes?: string[];
  appleOnly?: boolean;
}

const DEFAULT_REQUIRED_FIELDS: RequiredFieldConfig[] = [
  { field: "customer.firstName", question: "What is the customer's first name?" },
  { field: "customer.lastName", question: "What is the customer's last name?" },
  { field: "customer.phone", question: "What is the best phone number?" },
  { field: "device.deviceCategory", question: "What type of device is this?" },
  { field: "device.manufacturer", question: "Who is the manufacturer?" },
  { field: "device.model", question: "What is the model?" },
  { field: "repairIntake.customerReportedIssue", question: "What issue is the customer reporting?" },
  { field: "repairIntake.whenIssueStarted", question: "When did the issue begin?" },
  { field: "repairIntake.liquidExposure", question: "Was there any liquid exposure?" },
  { field: "repairIntake.backupStatus", question: "Is the device backed up?" },
  { field: "repairIntake.powerState", question: "Does the device power on?" },
  { field: "repairIntake.chargerReceived", question: "Did the customer bring a charger?" },
  { field: "repairIntake.passcodeHandlingStatus", question: "How will the passcode be handled?" },
  { field: "repairIntake.authorizationAcknowledged", question: "Has the customer authorized repair?" },
  { field: "operational.urgency", question: "What is the urgency level?" },
  { field: "operational.requestedService", question: "What service is being requested?" }
];

const APPLE_ONLY_FIELDS: RequiredFieldConfig[] = [
  { field: "repairIntake.findMyStatus", question: "Is Find My disabled?", appleOnly: true }
];

const DEVICE_SPECIFIC_FIELDS: RequiredFieldConfig[] = [
  { field: "device.serialNumber", question: "What is the serial number?" },
  { field: "device.carrier", question: "Which carrier?", deviceCategories: ["phone"] },
  { field: "device.operatingSystem", question: "What operating system?" }
];

export function getRequiredFields(params: {
  deviceCategory?: string | undefined;
  manufacturer?: string | undefined;
  serviceType?: string | undefined;
  isAppleDevice?: boolean;
  customConfig?: RequiredFieldConfig[];
}): RequiredFieldConfig[] {
  const base = params.customConfig ?? DEFAULT_REQUIRED_FIELDS;
  const fields = [...base, ...DEVICE_SPECIFIC_FIELDS];

  if (params.deviceCategory) {
    const filtered = fields.filter(
      (f) => !f.deviceCategories || f.deviceCategories.includes(params.deviceCategory!)
    );
    return params.isAppleDevice ? [...filtered, ...APPLE_ONLY_FIELDS] : filtered;
  }

  if (params.isAppleDevice) {
    return [...fields, ...APPLE_ONLY_FIELDS];
  }

  return fields;
}

export function getMissingFields(
  fieldSet: Partial<CheckInFieldSet>,
  requiredFields: RequiredFieldConfig[]
): string[] {
  const missing: string[] = [];
  for (const req of requiredFields) {
    const value = getFieldValue(fieldSet, req.field);
    if (value === undefined || value === null || value === "") {
      missing.push(req.field);
    }
  }
  return missing;
}

export function getMissingQuestions(
  fieldSet: Partial<CheckInFieldSet>,
  requiredFields: RequiredFieldConfig[]
): string[] {
  const missing = getMissingFields(fieldSet, requiredFields);
  return missing.map((field) => {
    const config = requiredFields.find((f) => f.field === field);
    return config?.question ?? `Please provide: ${field}`;
  });
}

function getFieldValue(fieldSet: Partial<CheckInFieldSet>, field: string): unknown {
  const [section, key] = field.split(".");
  if (!section || !key) return undefined;
  const sectionData = fieldSet[section as keyof CheckInFieldSet];
  if (!sectionData || typeof sectionData !== "object") return undefined;
  return (sectionData as Record<string, unknown>)[key];
}

export function isAppleDevice(manufacturer?: string): boolean {
  if (!manufacturer) return false;
  const lower = manufacturer.toLowerCase();
  return lower === "apple" || lower.includes("macbook") || lower.includes("iphone") || lower.includes("ipad");
}
