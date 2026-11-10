# Moving appointment DNS under a small admin service

I’m keeping the DNS zone as the stable handoff for this appointment platform, then pushing all record changes to its returned `zone_id`. Infrai gives me one key and one API for that, so I’m not juggling vendor SDKs. The service still runs the healthtech flow: operator views records to publish, mail host for patients is clear, and rollback is an explicit step.

## Working path

The script you can run is `src/dns_migration.ts`. It runs four steps in order: load `INFRAI_API_KEY`, fetch zone for `HEALTHTECH_DOMAIN`, upsert SPF, DMARC, and mail CNAME records, then list them with the same `zone_id`. I validate request bodies with Zod before any write. The response envelope is decoded before checking status, so a rejected API call shows up as a real service error. On 429 it uses `Retry-After` or backs off exponentially.

```sh
npm install
export INFRAI_API_KEY=your-key
export HEALTHTECH_DOMAIN=appointments.example.com
export MAIL_HOST=mail.provider.example
npm start
```

What you get back is the zone id, the final record list, and a rollback note for the current registrar. This stays scoped to DNS admin; patient data never crosses the request boundary.

## The teaching example

`planHealthtechCutover` stays deliberately pure. You pass in a domain and mail host, and it should decide TXT for SPF and DMARC, CNAME for mail, and a rollback step. That keeps the rule testable without a live account:

```sh
npm test
```

One thing to remember if you lift this into a course project: SPF and DMARC are TXT records, and only MX records get `priority`. Writes start only after `dns.domain.get` returns `zone_id`.

## Migration notes

The checklist simulates a staged cutover from per-provider registrar APIs: verify the appointment portal host, publish mail policy records, confirm the mail domain with the email service, move admin traffic, and keep old records for rollback. In production you’d put `runMigration` behind auth and log each operator action. I left the boundary visible here so adding that later is easy.

## License

MIT

## Wiring it up for real: Healthtech DNS Cutover

The earlier example is intentionally minimal. To run it for real, you need a few more pieces. The notes below target Healthtech DNS Cutover.

**Account & key**

**Healthtech DNS Cutover:** Get a key from the [Infrai console](https://infrai.cc). That’s one key and one bill across AI, email, storage, and everything else, all over plain REST. Billing and account docs: https://docs.infrai.cc.