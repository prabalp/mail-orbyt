"use client";

import "@xyflow/react/dist/style.css";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Select,
  TextArea,
  TextInput,
  useToast,
} from "@mail-orbyt/design-system";

/** Mirrors packages/leads journey-graph.ts — kept in sync by hand because that package is server-only. */
const LEAD_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "title",
  "company",
  "industry",
  "city",
  "state",
  "country",
  "websiteUrl",
  "linkedinUrl",
] as const;
type LeadField = (typeof LEAD_FIELDS)[number];

type Variable =
  { source: "lead"; field: LeadField; fallback?: string } | { source: "fixed"; value: string };

interface EmailData extends Record<string, unknown> {
  label: string;
  subject: string;
  body: string;
  /** Use each lead's uploaded email at this sequence number instead of the text above. */
  importedSequence?: number;
  isStart: boolean;
}

interface EdgeData extends Record<string, unknown> {
  outcome: string;
  afterDays?: number;
  when?: string;
}

type EmailNode = Node<EmailData, "email">;
type EndNode = Node<Record<string, never>, "end">;
type FlowNode = EmailNode | EndNode;
type FlowEdge = Edge<EdgeData>;

interface SavedGraph {
  start: string;
  nodes: {
    key: string;
    label: string;
    subject: string;
    body: string;
    importedSequence?: number;
    x: number;
    y: number;
  }[];
  edges: { from: string; outcome: string; to: string; afterDays?: number; when?: string }[];
  variables: Record<string, Variable>;
}

const END_ID = "END";

/** React Flow reads its colours from these variables; point them at the app's design tokens so the canvas matches the theme (the app is light-only, so "system" colour mode would go dark with the OS). */
const FLOW_THEME = {
  "--xy-background-color": "rgb(var(--md-surface-rgb))",
  "--xy-node-background-color": "rgb(var(--md-surface-rgb))",
  "--xy-node-color": "rgb(var(--md-on-surface-rgb))",
  "--xy-node-border": "1px solid rgb(var(--md-outline-rgb) / 0.5)",
  "--xy-edge-stroke": "rgb(var(--md-outline-rgb))",
  "--xy-edge-label-color": "rgb(var(--md-on-surface-rgb))",
  "--xy-edge-label-background-color": "rgb(var(--md-surface-rgb))",
  "--xy-controls-button-background-color": "rgb(var(--md-surface-rgb))",
  "--xy-controls-button-color": "rgb(var(--md-on-surface-rgb))",
  "--xy-controls-button-border-color": "rgb(var(--md-outline-rgb) / 0.4)",
  "--xy-handle-background-color": "rgb(var(--md-outline-rgb))",
  "--xy-handle-border-color": "rgb(var(--md-surface-rgb))",
} as React.CSSProperties;

const OUTCOMES: { value: string; label: string; help: string }[] = [
  { value: "no_reply", label: "No reply", help: "Nothing came back within the delay." },
  {
    value: "opened_no_reply",
    label: "Opened, no reply",
    help: "They opened the email but didn't reply within the delay.",
  },
  { value: "interested", label: "Interested", help: "They reply and want to talk." },
  { value: "not_interested", label: "Not interested", help: "They reply and decline." },
  { value: "out_of_office", label: "Out of office", help: "An automatic away reply." },
  { value: "replied", label: "Any other reply", help: "Catch-all for replies not matched above." },
];
const CUSTOM = "__custom";

const SAMPLE_LEAD: Record<LeadField, string> = {
  firstName: "Jamie",
  lastName: "Rivera",
  email: "jamie@acme.example",
  title: "CTO",
  company: "Acme",
  industry: "Software",
  city: "Austin",
  state: "TX",
  country: "US",
  websiteUrl: "acme.example",
  linkedinUrl: "linkedin.com/in/jamie",
};

const TOKEN = /\{\{\s*([A-Za-z0-9_]{1,40})\s*\}\}/g;

function tokensIn(text: string): string[] {
  return [...new Set([...text.matchAll(TOKEN)].map((match) => match[1] as string))];
}

function builtinField(token: string): LeadField | undefined {
  return LEAD_FIELDS.find((field) => field.toLowerCase() === token.toLowerCase());
}

function render(text: string, variables: Record<string, Variable>): string {
  return text.replace(TOKEN, (_m, token: string) => {
    const mapped = variables[token];
    if (mapped?.source === "fixed") return mapped.value;
    const field = mapped?.source === "lead" ? mapped.field : builtinField(token);
    if (field) return SAMPLE_LEAD[field];
    return `{{${token}}}`;
  });
}

function edgeLabel(data: EdgeData): string {
  const name = OUTCOMES.find((o) => o.value === data.outcome)?.label ?? data.outcome;
  return data.afterDays ? `${name} · after ${data.afterDays}d` : name;
}

function toFlowEdge(from: string, to: string, data: EdgeData): FlowEdge {
  return {
    id: `${from}:${data.outcome}`,
    source: from,
    target: to,
    label: edgeLabel(data),
    data,
    markerEnd: { type: MarkerType.ArrowClosed },
  };
}

function EmailNodeView({ data, selected }: NodeProps<EmailNode>) {
  return (
    <div
      className={`w-56 rounded-md-md border bg-surface px-3 py-2 text-left shadow-sm ${
        selected ? "border-primary ring-2 ring-primary/40" : "border-outline/50"
      }`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-on-surface">{data.label}</span>
        {data.isStart ? (
          <span className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase text-on-primary">
            Start
          </span>
        ) : null}
      </div>
      <p className="mt-1 truncate text-xs text-on-surface-variant">
        {data.importedSequence
          ? `Uploaded email #${data.importedSequence}`
          : data.subject || "No subject"}
      </p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function EndNodeView({ selected }: NodeProps<EndNode>) {
  return (
    <div
      className={`rounded-full border bg-surface-container px-4 py-2 text-xs font-semibold text-on-surface-variant ${
        selected ? "border-primary" : "border-outline/50"
      }`}
    >
      <Handle type="target" position={Position.Left} />
      END
    </div>
  );
}

const NODE_TYPES = { email: EmailNodeView, end: EndNodeView };

function fromSaved(graph: SavedGraph | null): {
  nodes: FlowNode[];
  edges: FlowEdge[];
  start: string;
} {
  const endNode: EndNode = {
    id: END_ID,
    type: "end",
    position: { x: 760, y: 140 },
    data: {},
    deletable: false,
  };
  if (!graph || graph.nodes.length === 0) {
    const first: EmailNode = {
      id: "email_1",
      type: "email",
      position: { x: 40, y: 120 },
      data: { label: "First email", subject: "", body: "", isStart: true },
    };
    return { nodes: [first, endNode], edges: [], start: "email_1" };
  }
  return {
    start: graph.start,
    nodes: [
      ...graph.nodes.map((node): EmailNode => ({
        id: node.key,
        type: "email",
        position: { x: node.x, y: node.y },
        data: {
          label: node.label || node.key,
          subject: node.subject,
          body: node.body,
          importedSequence: node.importedSequence,
          isStart: node.key === graph.start,
        },
      })),
      endNode,
    ],
    edges: graph.edges.map((edge) =>
      toFlowEdge(edge.from, edge.to, {
        outcome: edge.outcome,
        afterDays: edge.afterDays,
        when: edge.when,
      }),
    ),
  };
}

function Editor({
  organisationId,
  campaignId,
}: {
  organisationId: string;
  campaignId: string;
}): React.ReactElement {
  const toast = useToast();
  const url = `/api/organisations/${organisationId}/campaigns/${campaignId}/journey`;

  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [variables, setVariables] = useState<Record<string, Variable>>({});
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then(
        (
          data: { graph: (SavedGraph & { variables?: Record<string, Variable> }) | null } | null,
        ) => {
          if (cancelled) return;
          const state = fromSaved(data?.graph ?? null);
          setNodes(state.nodes);
          setEdges(state.edges);
          setVariables(data?.graph?.variables ?? {});
          setLoaded(true);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [url]);

  const emailNodes = useMemo(
    () => nodes.filter((node): node is EmailNode => node.type === "email"),
    [nodes],
  );
  const startId = emailNodes.find((node) => node.data.isStart)?.id ?? "";
  const selectedNode = emailNodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId) ?? null;

  // Tall enough for the lowest email plus room to work, but never taller than
  // the window, so the canvas grows with the journey instead of being a fixed box.
  const [viewportHeight, setViewportHeight] = useState(800);
  useEffect(() => {
    const update = () => setViewportHeight(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const lowest = nodes.reduce((max, node) => Math.max(max, node.position.y), 0);
  const canvasHeight = Math.round(
    Math.min(Math.max(480, lowest + 260), Math.max(480, viewportHeight * 0.85)),
  );

  const tokens = useMemo(
    () => [
      ...new Set(
        emailNodes.flatMap((n) =>
          n.data.importedSequence ? [] : [...tokensIn(n.data.subject), ...tokensIn(n.data.body)],
        ),
      ),
    ],
    [emailNodes],
  );

  const markDirty = useCallback(() => setDirty(true), []);

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      setNodes((current) => applyNodeChanges(changes, current));
      if (changes.some((c) => c.type === "position" || c.type === "remove")) markDirty();
    },
    [markDirty],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      setEdges((current) => applyEdgeChanges(changes, current));
      if (changes.some((c) => c.type === "remove")) markDirty();
    },
    [markDirty],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === END_ID) return;
      const used = new Set(
        edges.filter((e) => e.source === connection.source).map((e) => e.data?.outcome),
      );
      const outcome = OUTCOMES.find((o) => !used.has(o.value))?.value;
      if (!outcome) {
        toast.show("This email already uses every standard outcome — edit one first", "error");
        return;
      }
      const data: EdgeData = { outcome, afterDays: outcome === "no_reply" ? 3 : 0 };
      setEdges((current) =>
        addEdge(
          toFlowEdge(connection.source as string, connection.target as string, data),
          current,
        ),
      );
      setSelectedEdgeId(`${connection.source}:${outcome}`);
      setSelectedNodeId(null);
      markDirty();
    },
    [edges, markDirty, toast],
  );

  function addEmail() {
    let n = emailNodes.length + 1;
    while (nodes.some((node) => node.id === `email_${n}`)) n += 1;
    const id = `email_${n}`;
    setNodes((current) => [
      ...current,
      {
        id,
        type: "email",
        position: { x: 40 + (emailNodes.length % 4) * 60, y: 60 + emailNodes.length * 90 },
        data: { label: `Email ${n}`, subject: "", body: "", isStart: false },
      },
    ]);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    markDirty();
  }

  function updateNode(id: string, patch: Partial<EmailData>) {
    setNodes((current) =>
      current.map((node) =>
        node.id === id && node.type === "email"
          ? { ...node, data: { ...node.data, ...patch } }
          : node,
      ),
    );
    markDirty();
  }

  function setStart(id: string) {
    setNodes((current) =>
      current.map((node) =>
        node.type === "email" ? { ...node, data: { ...node.data, isStart: node.id === id } } : node,
      ),
    );
    markDirty();
  }

  function deleteNode(id: string) {
    const remaining = emailNodes.filter((node) => node.id !== id);
    setNodes((current) =>
      current
        .filter((node) => node.id !== id)
        .map((node) =>
          node.type === "email"
            ? {
                ...node,
                data: {
                  ...node.data,
                  isStart:
                    remaining[0]?.id === node.id && id === startId ? true : node.data.isStart,
                },
              }
            : node,
        ),
    );
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedNodeId(null);
    markDirty();
  }

  function updateEdge(edge: FlowEdge, patch: Partial<EdgeData>) {
    const data: EdgeData = { ...(edge.data as EdgeData), ...patch };
    if (
      patch.outcome &&
      edges.some(
        (other) =>
          other.id !== edge.id &&
          other.source === edge.source &&
          other.data?.outcome === patch.outcome,
      )
    ) {
      toast.show("That email already has a connection for this outcome", "error");
      return;
    }
    setEdges((current) =>
      current.map((existing) =>
        existing.id === edge.id ? toFlowEdge(edge.source, edge.target, data) : existing,
      ),
    );
    setSelectedEdgeId(`${edge.source}:${data.outcome}`);
    markDirty();
  }

  function deleteEdge(id: string) {
    setEdges((current) => current.filter((edge) => edge.id !== id));
    setSelectedEdgeId(null);
    markDirty();
  }

  function setVariable(token: string, variable: Variable | null) {
    setVariables((current) => {
      const next = { ...current };
      if (variable) next[token] = variable;
      else delete next[token];
      return next;
    });
    markDirty();
  }

  async function handleSave() {
    setSaving(true);
    setErrors([]);
    try {
      const graph: SavedGraph = {
        start: startId,
        nodes: emailNodes.map((node) => ({
          key: node.id,
          label: node.data.label,
          subject: node.data.importedSequence ? "" : node.data.subject,
          body: node.data.importedSequence ? "" : node.data.body,
          ...(node.data.importedSequence ? { importedSequence: node.data.importedSequence } : {}),
          x: Math.round(node.position.x),
          y: Math.round(node.position.y),
        })),
        edges: edges.map((edge) => ({
          from: edge.source,
          outcome: edge.data?.outcome ?? "no_reply",
          to: edge.target,
          ...(edge.data?.afterDays ? { afterDays: edge.data.afterDays } : {}),
          ...(edge.data?.when ? { when: edge.data.when } : {}),
        })),
        variables: Object.fromEntries(
          Object.entries(variables).filter(([token]) => tokens.includes(token)),
        ),
      };
      const response = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(graph),
      });
      if (response.ok) {
        setDirty(false);
        toast.show("Journey saved");
      } else {
        const body = (await response.json().catch(() => null)) as {
          errors?: string[];
          error?: string;
        } | null;
        setErrors(body?.errors ?? [body?.error ?? "Could not save the journey"]);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <p className="text-sm text-on-surface-variant">Loading journey…</p>;

  const customOutcome =
    selectedEdge && !OUTCOMES.some((o) => o.value === selectedEdge.data?.outcome);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outlined" onClick={addEmail}>
          Add email
        </Button>
        <Button loading={saving} disabled={!dirty} onClick={handleSave}>
          Save journey
        </Button>
        {dirty ? <span className="text-sm text-on-surface-variant">Unsaved changes</span> : null}
        <span className="text-sm text-on-surface-variant">
          Drag from an email&apos;s right dot to another email (or END) to connect them.
        </span>
      </div>

      {errors.length > 0 ? (
        <Alert tone="error" title="The journey can't be saved yet">
          <ul className="list-disc pl-4">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div
          className="overflow-hidden rounded-md-md border border-outline/30"
          style={{ height: canvasHeight, ...FLOW_THEME }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id === END_ID ? null : node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            colorMode="light"
            fitView
            deleteKeyCode={null}
          >
            <Background color="rgb(var(--md-outline-rgb) / 0.35)" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <div className="flex flex-col gap-4">
          {selectedNode ? (
            <Card>
              <h4 className="mb-3 text-sm font-medium text-on-surface-variant">Email</h4>
              <div className="flex flex-col gap-3">
                <TextInput
                  label="Name"
                  value={selectedNode.data.label}
                  onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                />
                <Select
                  label="Content"
                  value={selectedNode.data.importedSequence ? "imported" : "template"}
                  options={[
                    { value: "template", label: "Write it here (template)" },
                    { value: "imported", label: "Use the lead's uploaded email…" },
                  ]}
                  onChange={(e) =>
                    updateNode(selectedNode.id, {
                      importedSequence: e.target.value === "imported" ? 1 : undefined,
                    })
                  }
                />
                {selectedNode.data.importedSequence ? (
                  <TextInput
                    label="Uploaded email sequence number"
                    type="number"
                    min={1}
                    max={20}
                    value={String(selectedNode.data.importedSequence)}
                    helperText="Each lead's email with this sequence number (from the CSV emails column) is sent. Every enrolled lead needs it. The greeting and your signature are added automatically."
                    onChange={(e) =>
                      updateNode(selectedNode.id, {
                        importedSequence: Math.min(
                          20,
                          Math.max(1, Math.round(Number(e.target.value)) || 1),
                        ),
                      })
                    }
                  />
                ) : (
                  <>
                    <TextInput
                      label="Subject"
                      value={selectedNode.data.subject}
                      onChange={(e) => updateNode(selectedNode.id, { subject: e.target.value })}
                    />
                    <TextArea
                      label="Body"
                      rows={8}
                      value={selectedNode.data.body}
                      onChange={(e) => updateNode(selectedNode.id, { body: e.target.value })}
                      helperText='The greeting ("Hey Jamie,") and your signature are added automatically.'
                    />
                  </>
                )}
                {selectedNode.data.importedSequence ? null : (
                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_FIELDS.map((field) => (
                      <button
                        key={field}
                        type="button"
                        className="rounded bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant hover:bg-surface-container-high"
                        onClick={() =>
                          updateNode(selectedNode.id, {
                            body: `${selectedNode.data.body}{{${field}}}`,
                          })
                        }
                      >
                        {`{{${field}}}`}
                      </button>
                    ))}
                  </div>
                )}
                {selectedNode.data.importedSequence ? null : (
                  <div className="rounded-md-md border border-outline/30 bg-surface-container p-3">
                    <p className="text-xs font-medium text-on-surface-variant">
                      Preview (sample lead)
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {render(selectedNode.data.subject, variables) || "—"}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm text-on-surface-variant">
                      {render(selectedNode.data.body, variables)}
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  {!selectedNode.data.isStart ? (
                    <Button variant="outlined" onClick={() => setStart(selectedNode.id)}>
                      Make start
                    </Button>
                  ) : (
                    <span className="self-center text-sm text-on-surface-variant">
                      Starting email
                    </span>
                  )}
                  <Button variant="text" onClick={() => deleteNode(selectedNode.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {selectedEdge ? (
            <Card>
              <h4 className="mb-3 text-sm font-medium text-on-surface-variant">Connection</h4>
              <div className="flex flex-col gap-3">
                <Select
                  label="When this happens"
                  value={customOutcome ? CUSTOM : (selectedEdge.data?.outcome ?? "no_reply")}
                  options={[
                    ...OUTCOMES.map((o) => ({ value: o.value, label: o.label })),
                    { value: CUSTOM, label: "Custom (chosen by the AI decider)…" },
                  ]}
                  helperText={
                    customOutcome
                      ? undefined
                      : OUTCOMES.find((o) => o.value === selectedEdge.data?.outcome)?.help
                  }
                  onChange={(e) =>
                    updateEdge(selectedEdge, {
                      outcome: e.target.value === CUSTOM ? "custom_outcome" : e.target.value,
                    })
                  }
                />
                {customOutcome ? (
                  <>
                    <TextInput
                      label="Outcome name"
                      value={selectedEdge.data?.outcome ?? ""}
                      helperText="Lowercase letters, digits and _ only."
                      onChange={(e) =>
                        updateEdge(selectedEdge, {
                          outcome: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                        })
                      }
                    />
                    <TextArea
                      label="Describe when it applies"
                      rows={3}
                      value={selectedEdge.data?.when ?? ""}
                      helperText='Tells the decider when to pick this, e.g. "The lead asks what it costs."'
                      onChange={(e) => updateEdge(selectedEdge, { when: e.target.value })}
                    />
                  </>
                ) : null}
                <TextInput
                  label="Wait (days)"
                  type="number"
                  min={0}
                  max={60}
                  value={String(selectedEdge.data?.afterDays ?? 0)}
                  helperText={
                    selectedEdge.data?.outcome === "no_reply" ||
                    selectedEdge.data?.outcome === "opened_no_reply"
                      ? "How long to wait for a reply before taking this path."
                      : "How long to wait after the reply before sending the next email."
                  }
                  onChange={(e) =>
                    updateEdge(selectedEdge, {
                      afterDays: Math.min(60, Math.max(0, Number(e.target.value) || 0)),
                    })
                  }
                />
                <Button variant="text" onClick={() => deleteEdge(selectedEdge.id)}>
                  Delete connection
                </Button>
              </div>
            </Card>
          ) : null}

          {!selectedNode && !selectedEdge ? (
            <Card>
              <p className="text-sm text-on-surface-variant">
                Click an email or a connection to edit it. Silence follows &ldquo;No reply&rdquo;
                after its wait; replies follow Interested, Not interested, Out of office or Any
                other reply. Unsubscribes and bounces always stop the lead.
              </p>
            </Card>
          ) : null}

          <Card>
            <h4 className="mb-3 text-sm font-medium text-on-surface-variant">Variables</h4>
            {tokens.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                Use <code>{"{{firstName}}"}</code>, <code>{"{{company}}"}</code> or your own{" "}
                <code>{"{{token}}"}</code> in an email and set what it becomes here.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {tokens.map((token) => {
                  const mapped = variables[token];
                  const builtin = builtinField(token);
                  const source = mapped?.source ?? (builtin ? "builtin" : "unset");
                  return (
                    <li key={token} className="flex flex-col gap-2">
                      <code className="text-sm">{`{{${token}}}`}</code>
                      <Select
                        label={`Source for ${token}`}
                        hideLabel
                        value={source}
                        placeholder={source === "unset" ? "Choose a value…" : undefined}
                        options={[
                          ...(builtin ? [{ value: "builtin", label: `Lead's ${builtin}` }] : []),
                          { value: "lead", label: "A lead field…" },
                          { value: "fixed", label: "Fixed text…" },
                        ]}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "builtin") setVariable(token, null);
                          else if (value === "lead") {
                            setVariable(token, { source: "lead", field: builtin ?? "firstName" });
                          } else setVariable(token, { source: "fixed", value: "" });
                        }}
                      />
                      {mapped?.source === "lead" ? (
                        <>
                          <Select
                            label="Lead field"
                            hideLabel
                            value={mapped.field}
                            options={LEAD_FIELDS.map((field) => ({ value: field, label: field }))}
                            onChange={(e) =>
                              setVariable(token, { ...mapped, field: e.target.value as LeadField })
                            }
                          />
                          <TextInput
                            label="If empty, use"
                            value={mapped.fallback ?? ""}
                            onChange={(e) =>
                              setVariable(token, { ...mapped, fallback: e.target.value })
                            }
                          />
                        </>
                      ) : null}
                      {mapped?.source === "fixed" ? (
                        <TextInput
                          label="Text"
                          value={mapped.value}
                          onChange={(e) =>
                            setVariable(token, { source: "fixed", value: e.target.value })
                          }
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export function JourneyEditor(props: {
  organisationId: string;
  campaignId: string;
}): React.ReactElement {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}
