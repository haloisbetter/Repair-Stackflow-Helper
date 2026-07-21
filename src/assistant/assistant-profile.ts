import { z } from "zod";

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color (e.g. #2f8f83)");

const HtmlTagPattern = /<\/?[a-zA-Z][^>]*>/;
const DangerousUrlPattern = /\b(?:https?|ftp|file|data|javascript|vbscript):/i;

const SanitizedText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => !HtmlTagPattern.test(s), { message: "HTML tags are not allowed" })
    .refine((s) => !DangerousUrlPattern.test(s), { message: "URLs are not allowed" });

export const Avatar = z
  .object({
    type: z.literal("initials"),
    value: z.string().min(1).max(3)
  })
  .strict();

export const Appearance = z
  .object({
    accentColor: HexColor
  })
  .strict();

export const AssistantProfileSchema = z
  .object({
    name: SanitizedText(40),
    subtitle: z
      .string()
      .min(0)
      .max(80)
      .refine((s) => !HtmlTagPattern.test(s), { message: "HTML tags are not allowed" })
      .refine((s) => !DangerousUrlPattern.test(s), { message: "URLs are not allowed" }),
    welcomeMessage: SanitizedText(300),
    avatar: Avatar,
    appearance: Appearance,
    profileVersion: z.number().int().positive()
  })
  .strict();

export type AssistantProfile = z.infer<typeof AssistantProfileSchema>;

export const AssistantProfile = AssistantProfileSchema;

export const DEFAULT_ASSISTANT_PROFILE: AssistantProfile = {
  name: "Helper",
  subtitle: "Repair Assistant",
  welcomeMessage: "Ready to help with today's repairs.",
  avatar: { type: "initials", value: "H" },
  appearance: { accentColor: "#2f8f83" },
  profileVersion: 1
};
