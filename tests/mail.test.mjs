import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('../src/lib/server/mail.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const job = { id: 'fixture', kind: 'contact', listing_id: 'listing', name: '<test>', to: 'owner@example.invalid', replyTo: 'sender@example.invalid', body: '<script>not html</script>', published_at: '2026-01-01T00:00:00Z', expires_at: '2026-11-01T00:00:00Z' };
function setup(outcome, finishFails = false) {
  const writes = []; let sent; let closed = false;
  const fixtureModule = { exports: {} };
  vm.runInNewContext(code, { exports: fixtureModule.exports, module: fixtureModule, URL, Date, process: { env: { SMTP_PASSWORD: 'fixture-not-a-secret', APP_URL: 'https://teamfinder.example.invalid' } },
    require(name) {
      if (name === 'server-only') return {};
      if (name === '@supabase/supabase-js') return {};
      if (name === 'nodemailer') return { createTransport() { return { async sendMail(value) { sent = value; if (outcome instanceof Error) throw outcome; return outcome; }, close() { closed = true; } }; } };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const client = { async rpc(name, args) {
    if (name === 'mail_claim') return { data: job, error: null };
    writes.push(args); return { data: null, error: finishFails ? { message: 'database offline' } : null };
  } };
  return { api: fixtureModule.exports, client, writes, sent: () => sent, closed: () => closed };
}
test('verified reply address, plain-text content, stable message ID, no recipient leak in body', async () => {
  const s = setup({ accepted: ['owner@example.invalid'] });
  assert.equal(await s.api.deliver(s.client), 'sent');
  assert.equal(s.sent().replyTo.address, job.replyTo);
  assert.equal(s.sent().to.address, job.to);
  assert.equal(s.sent().html, undefined);
  assert.ok(s.sent().text.includes(job.body));
  assert.ok(!s.sent().text.includes(job.to));
  assert.equal(s.sent().messageId, '<fixture@rad-race.com>');
  assert.equal(s.writes[0].p_state, 'sent'); assert.ok(s.closed());
});
test('disconnect during DATA is uncertain, never marked safely retryable', async () => {
  const s = setup(Object.assign(new Error('connection lost'), { command: 'DATA', code: 'ESOCKET' }));
  assert.equal(await s.api.deliver(s.client), 'uncertain');
  assert.equal(s.writes[0].p_state, 'uncertain'); assert.ok(s.closed());
});
test('explicit SMTP rejection is retryable and credentials/errors are not returned', async () => {
  const s = setup(Object.assign(new Error('private SMTP diagnostic'), { responseCode: 451 }));
  assert.equal(await s.api.deliver(s.client), 'failed');
  assert.deepEqual(Object.keys(s.writes[0]).sort(), ['p_id', 'p_state']);
});
test('database outage after SMTP acceptance never converts send into retry', async () => {
  const s = setup({ accepted: ['owner@example.invalid'] }, true);
  await assert.rejects(s.api.deliver(s.client), /Database operation failed/);
  assert.equal(s.writes.length, 1); assert.equal(s.writes[0].p_state, 'sent');
});
test('reminder has original dates and management links only, no destructive GET', () => {
  const s = setup({ accepted: [] });
  const text = s.api.mailText({ ...job, kind: 'reminder' }, 'https://teamfinder.example.invalid').text;
  assert.ok(text.includes('1 January 2026')); assert.ok(text.includes('1 November 2026'));
  assert.ok(text.includes('/?manage=1')); assert.ok(text.includes('You don’t need to do anything.'));
  assert.ok(!text.includes('/delete')); assert.ok(!text.includes('token='));
});
