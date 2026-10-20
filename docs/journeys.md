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

## Creating one

`POST …/campaigns/with-sequence` (or the `create_campaign_with_sequence` MCP
tool) with `routingMode: "JOURNEY"` and no `steps`; one placeholder step is
created. Leads must be imported with the graph before enrolment.

## Next stage

An external decider (HTTP) will choose the outcome from the allowed set, with
open/click triggers, falling back to these rules on any error or timeout.
