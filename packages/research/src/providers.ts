/**
 * Interfaces for research providers that require a third-party API key
 * (search, news, licensed enrichment). None of these are wired to a real
 * provider yet — no API keys are configured — so the default
 * implementations report `isConfigured() === false` and the research job
 * records that as ResearchProviderRunStatus.SKIPPED_NOT_CONFIGURED rather
 * than silently doing nothing, calling a provider with a meaningless query
 * just to probe it, or failing the whole job.
 *
 * This also documents the boundary from section 8 of the spec: LinkedIn
 * URLs are treated as references only (stored, never scraped) unless an
 * authorized, licensed enrichment provider is configured to resolve them —
 * there is no unauthorized-scraping code path here to accidentally enable.
 */

export interface ProviderResult {
  sources: { url: string; title?: string; publishedAt?: Date }[];
}

export interface SearchProvider {
  isConfigured(): boolean;
  search(query: string): Promise<ProviderResult>;
}

export interface NewsProvider {
  isConfigured(): boolean;
  search(query: string): Promise<ProviderResult>;
}

export interface EnrichmentProvider {
  isConfigured(): boolean;
  lookup(params: {
    email?: string;
    domain?: string;
    linkedinUrl?: string;
  }): Promise<ProviderResult>;
}

export class NotConfiguredSearchProvider implements SearchProvider {
  isConfigured(): boolean {
    return false;
  }

  async search(): Promise<ProviderResult> {
    return { sources: [] };
  }
}

export class NotConfiguredNewsProvider implements NewsProvider {
  isConfigured(): boolean {
    return false;
  }

  async search(): Promise<ProviderResult> {
    return { sources: [] };
  }
}

export class NotConfiguredEnrichmentProvider implements EnrichmentProvider {
  isConfigured(): boolean {
    return false;
  }

  async lookup(): Promise<ProviderResult> {
    return { sources: [] };
  }
}
