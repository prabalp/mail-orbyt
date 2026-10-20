export type SocialPlatformName = "LINKEDIN" | "TWITTER" | "REDDIT" | "INSTAGRAM" | "THREADS";

export type SocialActionKind = "POST" | "REPLY" | "DM_REPLY" | "LIKE";

export type PolicyDecision = "ALLOW" | "ESCALATE" | "DENY";

export type Sentiment = "positive" | "neutral" | "negative" | "unknown";

export const ALL_SOCIAL_PLATFORMS: readonly SocialPlatformName[] = [
  "LINKEDIN",
  "TWITTER",
  "REDDIT",
  "INSTAGRAM",
  "THREADS",
];
