"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Chip,
  EmptyState,
  Skeleton,
  useToast,
} from "@mail-orbyt/design-system";
import { Search } from "lucide-react";
import { useOrganisation } from "../organisation-context";

interface ResearchFact {
  id: string;
  category: string;
  value: string;
  sourceUrl: string;
  sourceTitle: string | null;
  confidence: number;
  extractionMethod: string;
  evidenceExcerpt: string | null;
  status: "OBSERVED" | "USER_CONFIRMED" | "USER_REJECTED" | "EXPIRED" | "CONFLICTED";
}

interface ResearchJob {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  errorMessage: string | null;
}

interface KeywordRun {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED_NOT_CONFIGURED";
  mode: "DETERMINISTIC" | "AI";
  errorMessage: string | null;
}

interface PageText {
  text: string;
  charCount: number;
  url: string;
}

const STATUS_TONE: Record<ResearchFact["status"], "success" | "neutral" | "error" | "warning"> = {
  OBSERVED: "neutral",
  USER_CONFIRMED: "success",
  USER_REJECTED: "error",
  EXPIRED: "neutral",
  CONFLICTED: "warning",
};

function formatCategory(category: string): string {
  return category
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

export function ResearchPanel({
  subjectType,
  leadId,
  companyId,
}: {
  subjectType: "LEAD" | "COMPANY";
  leadId?: string;
  companyId?: string;
}): React.ReactElement {
  const { organisationId } = useOrganisation();
  const toast = useToast();
  const [facts, setFacts] = useState<ResearchFact[]>([]);
  const [job, setJob] = useState<ResearchJob | null>(null);
  const [keywordsAvailable, setKeywordsAvailable] = useState(false);
  const [keywordRun, setKeywordRun] = useState<KeywordRun | null>(null);
  const [pageText, setPageText] = useState<PageText | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [extractingKeywords, setExtractingKeywords] = useState(false);

  const subjectPath = subjectType === "LEAD" ? `leads/${leadId}` : `companies/${companyId}`;
  const apiBase = `/api/organisations/${organisationId}/${subjectPath}/research`;
  const keywordsApiBase = `${apiBase}/keywords`;

  const load = useCallback(async () => {
    const [researchResponse, keywordsResponse] = await Promise.all([
      fetch(apiBase),
      fetch(keywordsApiBase),
    ]);
    if (researchResponse.ok) {
      const data = await researchResponse.json();
      setFacts(data.facts);
      setJob(data.latestJob);
    }
    if (keywordsResponse.ok) {
      const data = await keywordsResponse.json();
      setKeywordsAvailable(data.available);
      setKeywordRun(data.latestRun);
      setPageText(data.pageText);
    }
    setLoading(false);
  }, [apiBase, keywordsApiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const jobActive = job?.status === "PENDING" || job?.status === "RUNNING";
    const keywordRunActive = keywordRun?.status === "PENDING" || keywordRun?.status === "RUNNING";
    if (!jobActive && !keywordRunActive) return undefined;
    const interval = setInterval(() => void load(), 1500);
    return () => clearInterval(interval);
  }, [job, keywordRun, load]);

  async function handleRunResearch() {
    setStarting(true);
    try {
      const response = await fetch(apiBase, { method: "POST" });
      if (response.ok) {
        await load();
      } else {
        toast.show("Could not start research", "error");
      }
    } finally {
      setStarting(false);
    }
  }

  async function handleExtractKeywords() {
    setExtractingKeywords(true);
    try {
      const response = await fetch(keywordsApiBase, { method: "POST" });
      if (response.ok) {
        await load();
      } else {
        const data = await response.json().catch(() => null);
        toast.show(data?.error ?? "Could not start keyword extraction", "error");
      }
    } finally {
      setExtractingKeywords(false);
    }
  }

  async function handleFactAction(factId: string, action: "confirm" | "reject") {
    const response = await fetch(`/api/organisations/${organisationId}/research/facts/${factId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (response.ok) {
      void load();
    } else {
      toast.show("Something went wrong", "error");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  const isRunning = job?.status === "PENDING" || job?.status === "RUNNING";
  const keywordRunActive = keywordRun?.status === "PENDING" || keywordRun?.status === "RUNNING";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface-variant">Research</h3>
        <div className="flex gap-2">
          {keywordsAvailable ? (
            <Button
              variant="text"
              loading={extractingKeywords || keywordRunActive}
              onClick={handleExtractKeywords}
            >
              Re-extract keywords
            </Button>
          ) : null}
          <Button variant="outlined" loading={starting || isRunning} onClick={handleRunResearch}>
            {facts.length > 0 ? "Rerun research" : "Run research"}
          </Button>
        </div>
      </div>

      {job?.status === "FAILED" ? (
        <Alert tone="error" title="Research failed">
          {job.errorMessage ?? "Something went wrong."}
        </Alert>
      ) : null}

      {keywordRun?.status === "FAILED" ? (
        <Alert tone="error" title="Keyword extraction failed">
          {keywordRun.errorMessage ?? "Something went wrong."}
        </Alert>
      ) : null}

      {pageText ? (
        <details className="rounded-md-md border border-outline/30 p-3">
          <summary className="cursor-pointer text-sm font-medium text-on-surface-variant">
            Saved website text ({pageText.charCount.toLocaleString()} characters)
          </summary>
          <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-on-surface">
            {pageText.text}
          </p>
        </details>
      ) : null}

      {facts.length === 0 && !isRunning ? (
        <EmptyState
          icon={<Search />}
          title="No research facts yet"
          description="Run research to gather publicly available, source-linked facts."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {facts.map((fact) => (
            <li key={fact.id} className="rounded-md-md border border-outline/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-on-surface-variant">
                    {formatCategory(fact.category)}
                  </p>
                  {fact.category === "extracted_keywords" ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {fact.value.split(", ").map((keyword) => (
                        <Chip key={keyword}>{keyword}</Chip>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-0.5 text-sm text-on-surface">{fact.value}</p>
                  )}
                </div>
                <Badge tone={STATUS_TONE[fact.status]}>{fact.status.replace("_", " ")}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-on-surface-variant">
                <a
                  href={fact.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {fact.sourceTitle ?? fact.sourceUrl}
                </a>
                <span>{Math.round(fact.confidence * 100)}% confidence</span>
              </div>
              {fact.status === "OBSERVED" ? (
                <div className="mt-2 flex gap-2">
                  <Button variant="text" onClick={() => handleFactAction(fact.id, "confirm")}>
                    Accept
                  </Button>
                  <Button variant="text" onClick={() => handleFactAction(fact.id, "reject")}>
                    Reject
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
