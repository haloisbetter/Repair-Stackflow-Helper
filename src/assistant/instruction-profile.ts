import { z } from "zod";

const HtmlTagPattern = /<\/?[a-zA-Z][^>]*>/;
const DangerousUrlPattern = /\b(?:https?|ftp|file|data|javascript|vbscript):/i;
const ShellPattern = /(?:^|\s)(?:rm\s|sudo\s|chmod\s|chown\s|exec\s|eval\s|system\s)/i;
const SecretPattern = /\b(?:password|secret|api[_-]?key|token|credential)\s*[:=]/i;
const ModelNamePattern = /\b(?:gpt-|claude-|llama-|mistral|gemini|bard|copilot)/i;

const InstructionText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => !HtmlTagPattern.test(s), { message: "HTML tags are not allowed" })
    .refine((s) => !DangerousUrlPattern.test(s), { message: "URLs are not allowed" })
    .refine((s) => !ShellPattern.test(s), { message: "Shell commands are not allowed" })
    .refine((s) => !SecretPattern.test(s), { message: "Secrets are not allowed" })
    .refine((s) => !ModelNamePattern.test(s), { message: "Model names are not allowed" });

const RuleList = (maxItems: number, maxItemLength: number) =>
  z.array(InstructionText(maxItemLength)).min(0).max(maxItems);

export const InstructionProfileSchema = z
  .object({
    globalInstructions: InstructionText(2000),
    toneRules: RuleList(20, 500),
    formattingRules: RuleList(20, 500),
    prohibitedClaims: RuleList(30, 500),
    escalationRules: RuleList(20, 500),
    profileVersion: z.number().int().positive()
  })
  .strict();

export type InstructionProfile = z.infer<typeof InstructionProfileSchema>;

export const InstructionProfile = InstructionProfileSchema;

export const DEFAULT_INSTRUCTION_PROFILE: InstructionProfile = {
  globalInstructions:
    "You are a repair-shop assistant. Provide factual, concise help based only on the technician's input. Never invent facts, prices, or customer data.",
  toneRules: ["Professional and respectful", "Plain language, avoid jargon when possible"],
  formattingRules: ["Use clear section headings", "Keep paragraphs short"],
  prohibitedClaims: [
    "Do not guarantee repair outcomes",
    "Do not state pricing unless provided in the input"
  ],
  escalationRules: [
    "If safety is at risk, advise stopping work and consulting a supervisor",
    "If customer data is missing, ask the technician rather than guessing"
  ],
  profileVersion: 1
};
