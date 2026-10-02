import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, deps) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const fixture = { exports: {} };
  vm.runInNewContext(code, { exports: fixture.exports, module: fixture, require: name => name in deps ? deps[name] : require(name) });
  return fixture.exports;
}
const listings = load('../src/lib/listings.ts', { './supabase': {} });
const Form = load('../src/app/CreateListingForm.tsx', { './page.module.css': {}, './PhotoPicker': { default: () => null, __esModule: true }, '@/lib/supabase': {}, '@/lib/listings': listings }).default;
const team = { type: 'team', looking: false, seeking: null, ridersNeeded: null, categories: ['Mixed'], vibes: [], name: 'Crew', revision: 1 };
function form(initial, kind = 'team') {
  return renderToStaticMarkup(React.createElement(Form, { initial, kind, email: 'fixture@example.invalid', onClose() {}, onSaved() {} }));
}
test('teams without a signal show only their profile type', () => {
  assert.equal(listings.meta(team), 'Team');
  assert.equal(listings.meta({ ...team, seeking: 'Anyone', ridersNeeded: 3 }), 'Team');
  assert.equal(listings.meta({ ...team, looking: true }), 'Team');
});
test('optional counts never produce null or zero rider labels', () => {
  assert.equal(listings.meta({ ...team, looking: true, seeking: 'Women' }), 'Looking for riders');
  assert.equal(listings.meta({ ...team, looking: true, seeking: 'Anyone', ridersNeeded: 1 }), 'Looking for 1 rider');
  assert.equal(listings.meta({ ...team, looking: true, seeking: 'Anyone', ridersNeeded: 5 }), 'Looking for 5+ riders');
});
test('create and edit team forms have an empty optional signal and no status switch', () => {
  for (const html of [form(), form(team), form({ ...team, seeking: 'Anyone', ridersNeeded: 0 })]) {
    assert.ok(html.includes('<option value="" selected="">No looking-for status</option>'));
    assert.ok(html.includes('any number of members'));
    assert.ok(html.includes('always contact you or request to join'));
    assert.ok(!html.includes('name="looking"'));
    assert.ok(!html.includes('TEAM COMPLETE'));
    assert.ok(!html.includes('team finder'));
    assert.ok(!html.includes('name="ridersNeeded"'));
  }
});
test('active search editing preserves seeking and permits an unspecified count', () => {
  const html = form({ ...team, looking: true, seeking: 'Women', ridersNeeded: null });
  assert.ok(html.includes('<option selected="">Women</option>'));
  assert.ok(html.includes('<option value="" selected="">No number specified</option>'));
  assert.ok(!/name="ridersNeeded"[^>]*required/.test(html));
});
test('rider search choices remain available', () => {
  const html = form(undefined, 'rider');
  assert.ok(html.includes('name="looking"'));
  assert.ok(html.includes('LOOKING FOR A TEAM'));
  assert.equal(listings.meta({ type: 'rider', looking: false }), 'Rider · not looking for a team');
});
