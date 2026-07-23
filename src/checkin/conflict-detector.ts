import type { ExtractedFieldValue, FieldConflict, TranscriptSegment } from "./checkin-contract.js";

export function detectConflicts(
  fields: ExtractedFieldValue[],
  segments: TranscriptSegment[]
): FieldConflict[] {
  const conflicts: FieldConflict[] = [];
  const byField = new Map<string, ExtractedFieldValue[]>();

  for (const f of fields) {
    const existing = byField.get(f.field) ?? [];
    existing.push(f);
    byField.set(f.field, existing);
  }

  for (const [field, values] of byField) {
    if (values.length < 2) continue;
    const distinctValues = getDistinctValues(values);
    if (distinctValues.length >= 2) {
      conflicts.push({
        field,
        values: distinctValues.map((v) => v.value),
        sourceSegmentIds: values.flatMap((v) => v.sourceSegmentIds),
        resolution: "unresolved",
        overrideReason: null
      });
    }
  }

  const textConflicts = detectTextConflicts(fields, segments);
  for (const tc of textConflicts) {
    if (!conflicts.some((c) => c.field === tc.field)) {
      conflicts.push(tc);
    }
  }

  return conflicts;
}

function getDistinctValues(fields: ExtractedFieldValue[]): ExtractedFieldValue[] {
  const seen = new Map<string, ExtractedFieldValue>();
  for (const f of fields) {
    const key = JSON.stringify(f.value);
    if (!seen.has(key)) {
      seen.set(key, f);
    }
  }
  return Array.from(seen.values());
}

function detectTextConflicts(fields: ExtractedFieldValue[], segments: TranscriptSegment[]): FieldConflict[] {
  const conflicts: FieldConflict[] = [];
  const allText = segments.map((s) => s.text.toLowerCase()).join(" ");

  const liquidField = fields.find((f) => f.field === "repairIntake.liquidExposure");
  if (liquidField) {
    const val = String(liquidField.value).toLowerCase();
    if (val === "none" && (allText.includes("spill") || allText.includes("water") || allText.includes("liquid"))) {
      conflicts.push({
        field: "repairIntake.liquidExposure",
        values: [liquidField.value, "mentioned in conversation"],
        sourceSegmentIds: liquidField.sourceSegmentIds,
        resolution: "unresolved",
        overrideReason: null
      });
    }
  }

  const chargerField = fields.find((f) => f.field === "repairIntake.chargerReceived");
  if (chargerField) {
    if (allText.includes("brought the charger") && allText.includes("didn't bring") && allText.includes("charger")) {
      conflicts.push({
        field: "repairIntake.chargerReceived",
        values: [chargerField.value, "conflicting statements"],
        sourceSegmentIds: chargerField.sourceSegmentIds,
        resolution: "unresolved",
        overrideReason: null
      });
    }
  }

  const backupField = fields.find((f) => f.field === "repairIntake.backupStatus");
  if (backupField) {
    const val = String(backupField.value).toLowerCase();
    if (val === "confirmed" && allText.includes("not backed up")) {
      conflicts.push({
        field: "repairIntake.backupStatus",
        values: [backupField.value, "not backed up"],
        sourceSegmentIds: backupField.sourceSegmentIds,
        resolution: "unresolved",
        overrideReason: null
      });
    }
  }

  return conflicts;
}

export function hasUnresolvedConflicts(conflicts: FieldConflict[]): boolean {
  return conflicts.some((c) => c.resolution === "unresolved");
}

export function canAcceptWithConflicts(conflicts: FieldConflict[], overrideReason?: string): boolean {
  if (!hasUnresolvedConflicts(conflicts)) return true;
  if (overrideReason && overrideReason.trim().length > 0) return true;
  return false;
}
