import { loadEnv } from "@mail-orbyt/config";
import { z } from "zod";
import type { LinkToolDescriptor } from "./registry.js";

export const GMAIL_TOOLS: LinkToolDescriptor[] = [
  {
    name: "get_gmail_connect_url",
    title: "Get a Gmail connect link",
    description:
      "Get a one-time link to open in a browser to connect a new Gmail sending inbox for this organisation. Opening the link starts Google's own OAuth consent screen; the connection only completes once a human opens the link and approves it while signed in to Mail Orbyt in that browser — this tool cannot complete the connection on its own, only hand back the link to start it.",
    requiredScope: "inboxes:manage",
    inputShape: {},
    // readOnlyHint: the tool only formats a URL — nothing is created until a
    // human opens it and approves Google's consent screen. openWorldHint is
    // true for the same reason: the link it hands back points at Google, the
    // one external entity any tool here touches.
    annotations: { readOnlyHint: true, openWorldHint: true },
    outputShape: {
      connectUrl: z.string().optional(),
      instructions: z.string().optional(),
    },
    buildResult: (_input, actor) => {
      const appUrl = loadEnv().APP_URL.replace(/\/$/, "");
      const connectUrl = `${appUrl}/api/gmail/oauth/start?organisationId=${encodeURIComponent(actor.organisationId)}`;
      return JSON.stringify({
        connectUrl,
        instructions:
          "Open this link in a browser where you're already signed in to Mail Orbyt. It redirects to Google's consent screen; approving it connects the Gmail sending inbox to this organisation.",
      });
    },
  },
];
