import { resolveTxt } from "node:dns/promises";

export type DnsCheckStatus = "PASS" | "FAIL" | "MISSING" | "UNKNOWN";

export interface DnsCheckResult {
  status: DnsCheckStatus;
  record?: string;
}

function flattenTxtRecords(records: string[][]): string[] {
  return records.map((chunks) => chunks.join(""));
}

async function lookupTxt(hostname: string): Promise<string[]> {
  try {
    const records = await resolveTxt(hostname);
    return flattenTxtRecords(records);
  } catch {
    return [];
  }
}

async function checkSpf(domain: string): Promise<DnsCheckResult> {
  const records = await lookupTxt(domain);
  const spf = records.find((record) => record.toLowerCase().startsWith("v=spf1"));
  if (!spf) return { status: "MISSING" };
  return { status: "PASS", record: spf };
}

async function checkDmarc(domain: string): Promise<DnsCheckResult> {
  const records = await lookupTxt(`_dmarc.${domain}`);
  const dmarc = records.find((record) => record.toLowerCase().startsWith("v=dmarc1"));
  if (!dmarc) return { status: "MISSING" };
  const isReject = /p=(reject|quarantine)/i.test(dmarc);
  return { status: isReject ? "PASS" : "FAIL", record: dmarc };
}

/**
 * DKIM has no fixed, guessable record location — the selector (the "s1" in
 * `s1._domainkey.example.com`) is chosen by whoever configured the domain
 * and shown in the Google Workspace admin console. Without one, DKIM stays
 * UNKNOWN rather than being reported as FAIL/MISSING, since we genuinely
 * don't know where to look.
 */
async function checkDkim(domain: string, selector: string | undefined): Promise<DnsCheckResult> {
  if (!selector) return { status: "UNKNOWN" };
  const records = await lookupTxt(`${selector}._domainkey.${domain}`);
  const dkim = records.find((record) => record.toLowerCase().includes("v=dkim1"));
  if (!dkim) return { status: "MISSING" };
  return { status: "PASS", record: dkim };
}

export interface DomainDnsCheckResult {
  spf: DnsCheckResult;
  dkim: DnsCheckResult;
  dmarc: DnsCheckResult;
}

/** Runs SPF/DKIM/DMARC checks for a sending domain via real DNS TXT lookups — no AI, no guessing, just resolving the actual records. */
export async function checkDomainDns(
  domain: string,
  dkimSelector: string | undefined,
): Promise<DomainDnsCheckResult> {
  const [spf, dkim, dmarc] = await Promise.all([
    checkSpf(domain),
    checkDkim(domain, dkimSelector),
    checkDmarc(domain),
  ]);
  return { spf, dkim, dmarc };
}
