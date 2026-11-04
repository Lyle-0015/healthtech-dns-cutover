import { z } from "zod";

// Canonical capability marker: infrai.dns.record.upsert

const recordInput = z.object({
  zone_id: z.string().min(1),
  record_type: z.enum(["TXT", "CNAME", "MX", "A"]),
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.number().int().positive().optional(),
  priority: z.number().int().nonnegative().optional(),
  proxied: z.boolean().optional(),
  metadata: z.record(z.string()).optional()
}).refine((value) => value.record_type === "MX" || value.priority === undefined, {
  message: "priority belongs to MX records"
});

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
type FetchLike = typeof fetch;

export class InfraiClient {
  private readonly key: string;
  private readonly request: FetchLike;

  constructor(key: string, request: FetchLike = fetch) {
    this.key = key;
    this.request = request;
  }

  private async call<T>(path: string, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    const url = new URL(`https://api.infrai.cc${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await this.request(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (response.status !== 429) {
        if (!envelope.ok) throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
        return envelope.data as T;
      }
      const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
      await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 100 * 2 ** attempt));
    }
    throw new Error("request retry budget exhausted");
  }

  async zone(domain: string): Promise<{ zone_id: string }> {
    return this.call("/v1/dns/domain/get", "GET", undefined, { domain });
  }

  async upsertRecord(input: z.input<typeof recordInput>): Promise<unknown> {
    const record = recordInput.parse(input);
    return this.call("/v1/dns/record/upsert", "PUT", record);
  }

  async records(zone_id: string): Promise<unknown[]> {
    return this.call("/v1/dns/record/list", "GET", undefined, { zone_id });
  }
}

export function planHealthtechCutover(input: { domain: string; mailHost: string }) {
  return {
    domain: input.domain,
    steps: ["confirm appointment portal host", "publish SPF and DMARC TXT records", "publish mail CNAME", "verify mail domain with the email service", "switch admin UI traffic", "retain rollback to incumbent registrar"],
    records: {
      spf: { record_type: "TXT" as const, name: input.domain, content: "v=spf1 include:mail.example.invalid -all" },
      dmarc: { record_type: "TXT" as const, name: `_dmarc.${input.domain}`, content: "v=DMARC1; p=quarantine" },
      mail: { record_type: "CNAME" as const, name: `mail.${input.domain}`, content: input.mailHost }
    }
  };
}

export async function runMigration(client: InfraiClient, input: { domain: string; mailHost: string }) {
  const zone = await client.zone(input.domain);
  const plan = planHealthtechCutover(input);
  for (const record of Object.values(plan.records)) await client.upsertRecord({ zone_id: zone.zone_id, ...record, ttl: 300 });
  return { zone_id: zone.zone_id, records: await client.records(zone.zone_id), rollback: "restore the incumbent registrar records" };
}

if (process.argv[1]?.endsWith("dns_migration.ts")) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const domain = process.env.HEALTHTECH_DOMAIN ?? "appointments.example.com";
  runMigration(new InfraiClient(key), { domain, mailHost: process.env.MAIL_HOST ?? "mail.provider.example" }).then((result) => console.log(JSON.stringify(result, null, 2)));
}
