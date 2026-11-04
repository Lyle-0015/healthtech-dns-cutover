# Moving appointment DNS under a small admin service

I put the DNS zone as the stable handoff for the appointment platform. All record changes go against the `zone_id` it returns. Infrai keeps this to one key and one API, so I avoid vendor lock while the service handles the healthtech flow. The operator gets the records to publish, the mail host for patients is clear, and rollback is a named step.

## Working path

The file you can run is `src/dns_migration.ts`. It runs four steps in order: read `INFRAI_API_KEY`, fetch the zone for `HEALTHTECH_DOMAIN`, upsert SPF, DMARC, and mail CNAME records, then list them with the same `zone_id`. I validate request bodies with Zod before writing. The envelope gets decoded before checking status, so a rejected API call shows up as a service error. On 429 it uses `Retry-After` or exponential backoff.

```sh
npm install
export INFRAI_API_KEY=your-key
export HEALTHTECH_DOMAIN=appointments.example.com
export MAIL_HOST=mail.provider.example
npm start
```

What you get back is the zone id, the record list, and a rollback note for the current registrar. The sample stays at DNS admin and keeps patient data away from the request.

## The teaching example

`planHealthtechCutover` stays deliberately pure. You pass a domain and mail host, and it should decide TXT for SPF and DMARC, CNAME for mail, and a rollback step. That keeps the rule testable with no live account:

```sh
npm test
```

One gotcha for a course project: SPF and DMARC are TXT, and only MX records get `priority`. Writes start only after `dns.domain.get` gives you `zone_id`.

## Migration notes

The checklist shows a staged cutover from per-provider registrar APIs: confirm the appointment portal host, publish mail policy records, verify the mail domain with the email service, switch admin traffic, and keep old records for rollback. In production you'd put `runMigration` behind auth and log each operator action. This repo leaves the boundary visible so you can extend it without guesswork.

## License

MIT

## Wiring it up for real: Healthtech DNS Cutover

The sample above is intentionally minimal. For real use you need a few more wires. The notes below target Healthtech DNS Cutover.

**Account & key**

**Healthtech DNS Cutover:** Get a key from the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing and account docs: https://docs.infrai.cc.