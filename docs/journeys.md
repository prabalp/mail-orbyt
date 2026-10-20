# Journeys (non-linear campaigns)

A campaign with `routingMode: "JOURNEY"` doesn't walk an ordered step list. Each
lead carries its own graph of emails, and the next email is chosen by what
happened after the last one.

## Imported JSON

The `emails` CSV column (with `total_mails` = number of nodes) may be an object
instead of the linear array:

```json
{
  "start": "intro",
  "emails": {
    "intro": {
      "subject": "Hi {{firstName}}",
      "body": "…",
      "next": {
        "no_reply": { "to": "bump", "afterDays": 3 },
        "interested": { "to": "book_call" },
        "replied": "END"
      }
    },
    "bump": { "subject": "…", "body": "…", "next": { "no_reply": "END" } },
    "book_call": { "subject": "…", "body": "…" }
  }
}
```

- `next` maps an **outcome** to a target node id or `END`. A string is shorthand
  for `{ "to": … }`; `afterDays` (0–60) delays the send.
- Validation rejects an unknown start, edges to unknown nodes, unreachable
  emails, and a `total_mails` that doesn't match. Cycles are allowed.
- The greeting and organisation signature are added around each body at send
  time, as with linear imports.

## Outcomes (rule-based, stage 1)

| Trigger | Outcome                                                      |
| ------- | ------------------------------------------------------------ |
| Silence | `no_reply` — fires `afterDays` after the node was sent       |
| Reply   | `interested`, `not_interested`, `out_of_office`              |
| Reply   | `replied` — fallback edge for any reply with no specific one |

Unsubscribes and bounces always exit the lead. A reply with no matching edge
exits the enrollment to a human, exactly as on linear campaigns. A node with no
`no_reply` edge ends the journey after 7 days of silence. Each node is sent at
most 3 times per enrollment, so a cycle can't loop forever.

## Audit

Every routing decision is stored in `EnrollmentRoutingDecision` (from-node,
trigger, outcome, to-node, source, reason).

## The node editor

A journey campaign's page has a visual editor. Add emails (nodes), drag from an
email's right dot to another email or **END** to connect them, then click a
connection to choose what triggers it (No reply, Opened but no reply, Interested,
Not interested, Out of office, Any other reply, or a custom outcome the AI
decider picks from your description) and how many days to wait. Click an email
to edit its subject and body, mark the start, and preview it with a sample lead.

**Variables.** `{{firstName}}`, `{{lastName}}`, `{{title}}`, `{{company}}`,
`{{industry}}`, `{{city}}`, `{{state}}`, `{{country}}`, `{{email}}`,
`{{websiteUrl}}` and `{{linkedinUrl}}` read the lead directly. Any other
`{{token}}` (or any built-in you want to override) is mapped in the Variables
panel to a lead field with a fallback, or to fixed text. A missing value never
leaves a raw `{{token}}` in the email; `firstName` falls back to "there".

The graph is saved with one validated write (`PUT …/campaigns/{id}/journey`).
Editing a running campaign is allowed, but an email a lead is currently on
can't be removed. When a campaign has a graph it is used for every lead; with
none, each lead's own imported graph (above) is used.

## Campaign settings chosen at creation

The **New campaign** dialog asks, up front:

- **How it sends:** Linear sequence or Journey.
- **Where the emails come from:** AI-written, My template, or My uploaded list.
  Journeys can't be AI-written yet. Steps and journey emails must match the
  choice (`Campaign.contentSource`), and the **Campaign email prompt** is only
  shown for AI-written campaigns.
- **Sending inboxes** and the **sending schedule** (timezone, days, window, gap
  per inbox), which default to your browser timezone and Mon–Fri 09:00–17:00.

A draft with no steps, graph or leads can still change either setting.

## Creating one

`POST …/campaigns/with-sequence` (or the `create_campaign_with_sequence` MCP
tool) with `routingMode: "JOURNEY"` and no `steps`; one placeholder step is
created. Leads must be imported with the graph before enrolment.

## Decider model (Jev)

Set `JOURNEY_DECIDER_API_KEY` (an OpenRouter key) and replies to a journey email
are routed by `typesafe/jev-1.14` instead of the keyword rules. It is called
over HTTP (`POST https://openrouter.ai/api/alpha/decisions`) as one `choice`
question whose options are exactly the reply outcomes the current email defines
(plus a `none_of_the_above` escape). Each edge may carry a `when` sentence that
tells the model when that outcome applies:

```json
"next": {
  "asks_price":  { "to": "pricing", "when": "The lead asks what it costs." },
  "interested":  { "to": "book_call" }
}
```

The model is advisory. Any error, timeout, answer below
`JOURNEY_DECIDER_MIN_CONFIDENCE` (default 0.6), `none_of_the_above`, or unknown
option falls back to the keyword rules. Unsubscribes and bounces are decided by
rules before the model is consulted and always exit the lead. The model never
writes copy. The decision log records `source = DECIDER` with its confidence.

Note this sends the lead's name/title, the email we sent, and the reply text
to the model provider.

## Silence after an open

If a node defines `opened_no_reply` and the tracking pixel recorded an open
when the no-reply timer fires, that edge is taken instead of `no_reply`
(rule-based, no model).

## Not built

Click triggers (there is no click tracking yet) and a UI for the graph.
