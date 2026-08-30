import { resolveCname, resolveTxt } from "node:dns/promises";

export type DomainCheckStatus = "PASS" | "FAIL" | "MISSING";

async function lookupCname(hostname: string): Promise<string[]> {
  try {
    return await resolveCname(hostname);
  } catch {
    return [];
  }
}

async function lookupTxt(hostname: string): Promise<string[]> {
  try {
    const records = await resolveTxt(hostname);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

/** Confirms the domain CNAMEs to the expected proxy target — the record that actually routes pixel traffic to this app. */
export async function checkCname(
  domain: string,
  expectedTarget: string,
): Promise<DomainCheckStatus> {
  const records = await lookupCname(domain);
  if (records.length === 0) return "MISSING";
  const normalizedTarget = expectedTarget.toLowerCase().replace(/\.$/, "");
  const matches = records.some(
    (record) => record.toLowerCase().replace(/\.$/, "") === normalizedTarget,
  );
  return matches ? "PASS" : "FAIL";
}

/**
 * Confirms domain ownership via a TXT record under `_mail-orbyt-verify`,
 * kept separate from the CNAME check above — proving ownership is what
 * gates the reverse proxy issuing a TLS certificate for this domain, and
 * must not be satisfiable just by pointing DNS at us.
 */
export async function checkVerificationTxt(
  domain: string,
  token: string,
): Promise<DomainCheckStatus> {
  const records = await lookupTxt(`_mail-orbyt-verify.${domain}`);
  if (records.length === 0) return "MISSING";
  return records.includes(token) ? "PASS" : "FAIL";
}
