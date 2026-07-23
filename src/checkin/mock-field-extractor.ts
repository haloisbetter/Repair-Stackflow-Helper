import type { ExtractCheckinFieldsInput, ExtractCheckinFieldsOutput } from "./checkin-task-contracts.js";
import type { ExtractedFieldValue } from "./checkin-contract.js";
import { normalizePhone, normalizeEmail } from "./checkin-fields.js";

export function extractFieldsDeterministic(input: ExtractCheckinFieldsInput): ExtractCheckinFieldsOutput {
  const allText = input.transcriptSegments.map((s) => s.text).join(" ");
  const lower = allText.toLowerCase();
  const fields: ExtractedFieldValue[] = [];
  const warnings: string[] = [];

  const nameMatch = allText.match(/(?:my name is|i'm|i am)\s+([A-Z][a-z]+)\s+([A-Z][a-z]+)/i);
  if (nameMatch) {
    fields.push(makeField("customer.firstName", nameMatch[1]!, "stated", input.transcriptSegments));
    fields.push(makeField("customer.lastName", nameMatch[2]!, "stated", input.transcriptSegments));
  }

  const phoneMatch = allText.match(/(?:phone(?:\s+number)?|call me(?:\s+at)?)[:\s]+(?:is\s+)?([\d\s\-()]+)/i);
  if (phoneMatch) {
    fields.push(makeField("customer.phone", normalizePhone((phoneMatch[1] ?? "").trim()), "stated", input.transcriptSegments));
  }

  const emailMatch = allText.match(/email[:\s]+(\S+@\S+)/i);
  if (emailMatch) {
    fields.push(makeField("customer.email", normalizeEmail((emailMatch[1] ?? "").trim()), "stated", input.transcriptSegments));
  }

  const deviceMatch = allText.match(/(?:my|bringing in(?:\s+my)?)\s+((?:MacBook|iPhone|iPad|Dell|HP|Lenovo|Surface|Chromebook|Samsung|Google)[^,.]*)/i);
  if (deviceMatch) {
    const deviceText = (deviceMatch[1] ?? "").trim();
    const category = detectDeviceCategory(deviceText);
    const manufacturer = detectManufacturer(deviceText);
    fields.push(makeField("device.deviceCategory", category, "stated", input.transcriptSegments));
    fields.push(makeField("device.manufacturer", manufacturer, "stated", input.transcriptSegments));
    fields.push(makeField("device.model", deviceText, "stated", input.transcriptSegments));
  }

  const serialMatch = allText.match(/serial(?:\s+number)?[:\s]+([A-Z0-9]+)/i);
  if (serialMatch) {
    fields.push(makeField("device.serialNumber", (serialMatch[1] ?? "").trim(), "stated", input.transcriptSegments));
  }

  const colorMatch = allText.match(/(?:color|colour)[:\s]+(\w+)/i);
  if (colorMatch) {
    fields.push(makeField("device.color", (colorMatch[1] ?? "").trim(), "stated", input.transcriptSegments));
  }

  const issueMatch = allText.match(/(?:won't turn on|won't power on|screen is|battery|charging|water damage|cracked|slow|overheating|random)/i);
  if (issueMatch) {
    const issueText = extractIssueText(allText);
    fields.push(makeField("repairIntake.customerReportedIssue", issueText, "stated", input.transcriptSegments));
  }

  const timeMatch = allText.match(/(?:two days ago|yesterday|last week|last month|today|(\d+)\s+days?\s+ago)/i);
  if (timeMatch) {
    fields.push(makeField("repairIntake.whenIssueStarted", timeMatch[0].trim(), "stated", input.transcriptSegments));
  }

  if (lower.includes("water") || lower.includes("spill") || lower.includes("liquid")) {
    if (lower.includes("maybe") || lower.includes("not sure") || lower.includes("might")) {
      fields.push(makeField("repairIntake.liquidExposure", "unknown", "stated", input.transcriptSegments));
      warnings.push("Liquid exposure mentioned with uncertainty.");
    } else {
      fields.push(makeField("repairIntake.liquidExposure", "minor", "stated", input.transcriptSegments));
    }
  } else if (lower.includes("no water") || lower.includes("no liquid")) {
    fields.push(makeField("repairIntake.liquidExposure", "none", "stated", input.transcriptSegments));
  }

  if (lower.includes("not backed up") || lower.includes("don't have") && lower.includes("backed up")) {
    fields.push(makeField("repairIntake.backupStatus", "not_confirmed", "stated", input.transcriptSegments));
    warnings.push("Customer indicates data is not backed up — data risk.");
  } else if (lower.includes("backed up") || lower.includes("have backup")) {
    fields.push(makeField("repairIntake.backupStatus", "confirmed", "stated", input.transcriptSegments));
  }

  if (lower.includes("won't turn on") || lower.includes("won't power on") || lower.includes("no power")) {
    fields.push(makeField("repairIntake.powerState", "no_power", "stated", input.transcriptSegments));
  } else if (lower.includes("powers on")) {
    fields.push(makeField("repairIntake.powerState", "powers_on", "stated", input.transcriptSegments));
  }

  const chargerMatch = allText.match(/(?:brought|have)\s+(?:the\s+)?charger/i);
  const noChargerMatch = allText.match(/(?:didn't|did not|no)\s+(?:bring|have)\s+(?:the\s+)?charger/i);
  if (chargerMatch && !noChargerMatch) {
    fields.push(makeField("repairIntake.chargerReceived", true, "stated", input.transcriptSegments));
  } else if (noChargerMatch) {
    fields.push(makeField("repairIntake.chargerReceived", false, "stated", input.transcriptSegments));
  }

  const caseMatch = allText.match(/(?:brought|have)\s+(?:the\s+)?case/i);
  const noCaseMatch = allText.match(/(?:didn't|did not|no)\s+(?:bring|have)\s+(?:the\s+)?case/i);
  if (noCaseMatch && !caseMatch) {
    fields.push(makeField("repairIntake.caseReceived", false, "stated", input.transcriptSegments));
  } else if (caseMatch) {
    fields.push(makeField("repairIntake.caseReceived", true, "stated", input.transcriptSegments));
  }

  if (lower.includes("passcode")) {
    if (lower.includes("enter") && lower.includes("myself")) {
      fields.push(makeField("repairIntake.passcodeHandlingStatus", "customer_will_enter", "stated", input.transcriptSegments));
    } else {
      fields.push(makeField("repairIntake.passcodeHandlingStatus", "not_requested", "inferred", input.transcriptSegments));
    }
  }

  if (lower.includes("warranty")) {
    fields.push(makeField("repairIntake.findMyStatus", "unknown", "inferred", input.transcriptSegments));
    warnings.push("Warranty status mentioned but not verified.");
  }

  if (lower.includes("data")) {
    if (lower.includes("critical") || lower.includes("really need")) {
      fields.push(makeField("repairIntake.dataImportance", "critical", "stated", input.transcriptSegments));
    }
  }

  for (const existing of input.existingConfirmedFields) {
    if (existing.employeeConfirmed) {
      const idx = fields.findIndex((f) => f.field === existing.field);
      if (idx >= 0) {
        fields[idx] = { ...fields[idx]!, value: existing.value, employeeConfirmed: true, confidence: "confirmed" };
      } else {
        fields.push({
          field: existing.field,
          value: existing.value,
          confidence: "confirmed",
          sourceSegmentIds: [],
          employeeConfirmed: true
        });
      }
    }
  }

  if (lower.includes("ignore all previous instructions") || lower.includes("===system===")) {
    warnings.push("Potential prompt injection detected in transcript — extracted fields flagged for review.");
  }

  if (allText.match(/\bpassword\b/i) || allText.match(/\bpasscode\b/i)) {
    warnings.push("Password mentioned in transcript — excluded from extracted fields.");
  }

  return {
    extractedFields: fields,
    conflicts: [],
    missingFields: [],
    warnings
  };
}

function makeField(field: string, value: unknown, confidence: ExtractedFieldValue["confidence"], segments: { segmentId: string }[]): ExtractedFieldValue {
  return {
    field,
    value,
    confidence,
    sourceSegmentIds: segments.slice(0, 5).map((s) => s.segmentId),
    employeeConfirmed: false
  };
}

function detectDeviceCategory(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("macbook") || lower.includes("laptop") || lower.includes("dell") || lower.includes("hp") || lower.includes("lenovo") || lower.includes("surface")) return "laptop";
  if (lower.includes("iphone") || lower.includes("phone") || lower.includes("samsung") || lower.includes("pixel")) return "phone";
  if (lower.includes("ipad") || lower.includes("tablet")) return "tablet";
  if (lower.includes("watch")) return "watch";
  return "other";
}

function detectManufacturer(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("macbook") || lower.includes("iphone") || lower.includes("ipad")) return "Apple";
  if (lower.includes("dell")) return "Dell";
  if (lower.includes("hp")) return "HP";
  if (lower.includes("lenovo")) return "Lenovo";
  if (lower.includes("surface")) return "Microsoft";
  if (lower.includes("samsung")) return "Samsung";
  if (lower.includes("chromebook")) return "Google";
  return "Unknown";
}

function extractIssueText(text: string): string {
  const sentences = text.split(/(?<=[.;])\s+/);
  for (const s of sentences) {
    if (/won't turn on|won't power on|screen|battery|charging|water damage|cracked|slow|overheating|random|shuts off/i.test(s)) {
      return s.trim();
    }
  }
  return "Customer reported an issue with their device.";
}
