import { z } from "zod";
import type { RouteToolDescriptor } from "./registry.js";

/** Both GET and PATCH on /settings/ai-provider return this. The API key itself is never echoed back — only a masked hint. */
const aiProviderShape = {
  apiKeyHint: z.string().nullable().optional(),
  keyDecryptionFailed: z.boolean().optional(),
  model: z.string().nullable().optional(),
  usingEnvironmentKey: z.boolean().optional(),
  environmentKeyAvailable: z.boolean().optional(),
  environmentModel: z.string().nullable().optional(),
};

const emailTemplateShape = {
  emailPromptInstructions: z.string().nullable().optional(),
  calendlyUrl: z.string().nullable().optional(),
  generationSystemPrompt: z.string().nullable().optional(),
  reviewSystemPrompt: z.string().nullable().optional(),
};

export const SETTINGS_TOOLS: RouteToolDescriptor[] = [
  {
    name: "get_ai_provider_settings",
    title: "Get AI provider settings",
    description:
      "Get the organisation's AI provider settings — masked API key hint, model, and environment defaults.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/settings/ai-provider",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: aiProviderShape,
  },
  {
    name: "update_ai_provider_settings",
    title: "Update AI provider settings",
    description: "Update the organisation's AI provider settings.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/settings/ai-provider",
    requiredScope: "campaigns:manage",
    inputShape: {
      apiKey: z
        .string()
        .max(400)
        .optional()
        .describe("Omit to keep the existing key — pass an empty string to clear it"),
      model: z.string().max(200).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: aiProviderShape,
  },
  {
    name: "get_email_template_settings",
    title: "Get email template settings",
    description: "Get the organisation's default email template and AI prompt settings.",
    method: "GET",
    pathTemplate: "/api/organisations/{organisationId}/settings/email-template",
    requiredScope: "profile",
    inputShape: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      ...emailTemplateShape,
      defaults: z
        .object({
          generationSystemPrompt: z.string(),
          reviewSystemPrompt: z.string(),
          campaignPrompt: z.string(),
        })
        .partial()
        .passthrough()
        .optional(),
    },
  },
  {
    name: "update_email_template_settings",
    title: "Update email template settings",
    description: "Update the organisation's default email template and AI prompt settings.",
    method: "PATCH",
    pathTemplate: "/api/organisations/{organisationId}/settings/email-template",
    requiredScope: "campaigns:manage",
    inputShape: {
      emailPromptInstructions: z.string().max(4000).optional(),
      calendlyUrl: z.string().optional().describe("A URL, or an empty string to clear it"),
      generationSystemPrompt: z.string().max(8000).optional(),
      reviewSystemPrompt: z.string().max(8000).optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    outputShape: emailTemplateShape,
  },
  {
    name: "preview_email_prompt",
    title: "Preview the AI email prompt",
    description:
      "Render the exact AI prompt against sample data for preview, without saving anything.",
    method: "POST",
    pathTemplate: "/api/organisations/{organisationId}/settings/email-template/prompt-preview",
    requiredScope: "profile",
    inputShape: {
      campaignPrompt: z.string().max(4000).optional(),
      calendlyUrl: z.string().optional(),
      generationSystemPrompt: z.string().max(8000).optional(),
    },
    // A POST only because the prompts are too long for a query string — it
    // renders against sample data and persists nothing, so it is a read.
    annotations: { readOnlyHint: true, openWorldHint: false },
    outputShape: {
      system: z.string().optional(),
      user: z.string().optional(),
    },
  },
];
