import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const code = ts.transpileModule(readFileSync(new URL('../src/lib/server/mail.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const job = { id: 'fixture', kind: 'contact', listing_id: 'listing', name: '<test>', to: 'owner@example.invalid', replyTo: 'sender@example.invalid', body: '<script>not html</script>', published_at: '2026-01-01T00:00:00Z', expires_at: '2026-11-01T00:00:00Z' };
function setup(outcome, finishFails = false, ready = true) {
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
    if (name === 'chat_email_claim') return { data: { id: 'notify-fixture', to: job.to }, error: null };
    if (name === 'chat_email_ready') return { data: ready, error: null };
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

test('chat alert links to inbox without content, sender or reply-to leakage', async () => {
  const s = setup({ accepted: [job.to] });
  assert.equal(await s.api.deliverChatNotification(s.client), 'sent');
  assert.equal(s.sent().to.address, job.to);
  assert.equal(s.sent().replyTo, undefined);
  assert.ok(s.sent().text.includes('https://teamfinder.example.invalid/?messages=1'));
  for (const privateValue of [job.body, job.to, job.replyTo, job.name]) assert.ok(!s.sent().text.includes(privateValue));
  assert.equal(s.sent().messageId, '<chat-notify-fixture@rad-race.com>');
  assert.equal(s.writes[0].p_state, 'sent');
});
test('read, deleted, blocked or opted-out batch is skipped before SMTP', async () => {
  const s = setup({ accepted: [job.to] }, false, false);
  assert.equal(await s.api.deliverChatNotification(s.client), 'skipped');
  assert.equal(s.sent(), undefined);
  assert.equal(s.writes[0].p_state, 'skipped');
});
test('chat SMTP ambiguity is not retried; definitive rejection can retry', async () => {
  const uncertain = setup(Object.assign(new Error('private'), { command: 'DATA', code: 'ESOCKET' }));
  assert.equal(await uncertain.api.deliverChatNotification(uncertain.client), 'uncertain');
  const rejected = setup(Object.assign(new Error('private'), { code: 'EAUTH', responseCode: 535 }));
  assert.equal(await rejected.api.deliverChatNotification(rejected.client), 'failed');
});
test('chat SMTP success followed by database outage preserves uncertain lease', async () => {
  const s = setup({ accepted: [job.to] }, true);
  await assert.rejects(s.api.deliverChatNotification(s.client), /Database operation failed/);
  assert.equal(s.writes.length, 1);
  assert.equal(s.writes[0].p_state, 'sent');
});
