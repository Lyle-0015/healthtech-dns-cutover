import assert from "node:assert/strict";
import test from "node:test";
import { planHealthtechCutover } from "./dns_migration.ts";

test("the cutover plan keeps SPF and DMARC as TXT records and mail as CNAME", () => {
  const plan = planHealthtechCutover({ domain: "clinic.example", mailHost: "mail.example.net" });
  assert.equal(plan.records.spf.record_type, "TXT");
  assert.equal(plan.records.dmarc.record_type, "TXT");
  assert.equal(plan.records.mail.record_type, "CNAME");
  assert.match(plan.steps.join(" "), /rollback/);
});
