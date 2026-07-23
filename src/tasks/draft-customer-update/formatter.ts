import type { DraftCustomerUpdateOutput } from "./contract.js";

export function normalizeOutput(raw: DraftCustomerUpdateOutput): DraftCustomerUpdateOutput {
  return {
    customerFacingDraft: raw.customerFacingDraft.trim(),
    subjectLine: raw.subjectLine?.trim() ?? undefined,
    communicationChannel: raw.communicationChannel,
    confirmedFactsUsed: raw.confirmedFactsUsed.map((s) => s.trim()).filter((s) => s.length > 0),
    factsExcluded: raw.factsExcluded.map((s) => s.trim()).filter((s) => s.length > 0),
    requiredCustomerAction: raw.requiredCustomerAction.trim(),
    nextStep: raw.nextStep.trim(),
    warnings: raw.warnings.map((s) => s.trim()).filter((s) => s.length > 0),
    uncertainOrMissingInformation: raw.uncertainOrMissingInformation.map((s) => s.trim()).filter((s) => s.length > 0),
    prohibitedClaimsAvoided: raw.prohibitedClaimsAvoided.map((s) => s.trim()).filter((s) => s.length > 0)
  };
}
