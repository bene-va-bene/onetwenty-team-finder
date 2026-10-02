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
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const fixture = { exports: {} };
  vm.runInNewContext(code, {
    exports: fixture.exports,
    module: fixture,
    require: name => name in deps ? deps[name] : require(name),
  });
  return fixture.exports;
}

const listings = load('../src/lib/listings.ts', { './supabase': {} });
const Form = load('../src/app/CreateListingForm.tsx', {
  './page.module.css': {},
  './PhotoPicker': { default: () => null, __esModule: true },
  '@/lib/supabase': {},
  '@/lib/listings': listings,
}).default;

const baseTeam = {
  id: '00000000-0000-0000-0000-000000000001',
  type: 'team',
  looking: false,
  seeking: null,
  ridersNeeded: null,
  categories: ['Men'],
  vibes: [],
  name: 'Crew',
  region: 'Münster',
  description: '',
  languages: 'DE',
  riderGender: null,
  age: null,
  strava: '',
  instagram: '',
  image_path: null,
  status: 'active',
  revision: 1,
  published_at: null,
  expires_at: null,
  created_at: '',
  updated_at: '',
};

function form(initial, kind = 'team') {
  return renderToStaticMarkup(
    React.createElement(Form, {
      initial,
      kind,
      email: 'fixture@example.invalid',
      onClose() {},
      onSaved() {},
    }),
  );
}

test('rider display derives the requested team type from two slim inputs', () => {
  assert.equal(
    listings.riderTeamPreference({
      type: 'rider',
      looking: true,
      riderGender: 'Man',
      categories: ['Men'],
    }),
    'Men’s Team',
  );
  assert.equal(
    listings.riderTeamPreference({
      type: 'rider',
      looking: true,
      riderGender: 'Woman',
      categories: ['Women'],
    }),
    'Women’s Team',
  );
  assert.equal(
    listings.riderTeamPreference({
      type: 'rider',
      looking: true,
      riderGender: 'Woman',
      categories: ['Mixed'],
    }),
    'Mixed Team',
  );
});

test('team metadata separates composition from who the team is looking for', () => {
  assert.equal(listings.meta(baseTeam), 'Team');
  assert.equal(listings.meta({ ...baseTeam, looking: true, seeking: 'Women' }), 'Team · looking for Women');
  assert.equal(listings.meta({ ...baseTeam, looking: true, seeking: 'Mixed' }), 'Team · looking for Mixed');
});

test('rider form stays intentionally narrow', () => {
  const html = form(undefined, 'rider');
  assert.ok(html.includes('I AM'));
  assert.ok(html.includes('Man'));
  assert.ok(html.includes('Woman'));
  assert.ok(html.includes('LOOKING FOR A TEAM'));
  assert.ok(html.includes('Mixed'));
  assert.ok(html.includes('Not mixed'));
  assert.ok(html.includes('name="region"'));
  assert.ok(html.includes('name="languages"'));
  assert.ok(!html.includes('JUST HERE TO RIDE'));
  assert.ok(!html.includes('RACE CLASSIFICATION'));
  assert.ok(!html.includes('OPEN TO TEAM CATEGORIES'));
});

test('team form uses team language and derives member data instead of asking twice', () => {
  const html = form();
  assert.ok(html.includes('TEAM NAME'));
  assert.ok(html.includes('DESCRIBE YOUR TEAM'));
  assert.ok(html.includes('Tell us what your team is about.'));
  assert.ok(html.includes('Not looking right now'));
  assert.ok(html.includes('<option>Men</option>'));
  assert.ok(html.includes('<option>Women</option>'));
  assert.ok(html.includes('<option>Mixed</option>'));
  assert.ok(!html.includes('name="region"'));
  assert.ok(!html.includes('name="languages"'));
  assert.ok(!html.includes('TEAM CATEGORY'));
});

test('editing a team preserves its looking-for choice', () => {
  const html = form({ ...baseTeam, looking: true, seeking: 'Women', ridersNeeded: 2 });
  assert.ok(html.includes('<option selected="">Women</option>'));
  assert.ok(html.includes('name="ridersNeeded"'));
});

test('captain abandonment requires a deliberate handover in the management UI', () => {
  const source = readFileSync(new URL('../src/app/MyListings.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('YOU’RE ABOUT TO ABANDON YOUR TEAM.'));
  assert.ok(source.includes('Please choose the new captain.'));
  assert.ok(source.includes('paddock_abandon_team'));
  assert.ok(source.includes('ABANDON TEAM'));
});

test('database migration derives team city, languages and composition from accepted riders', () => {
  const core = readFileSync(
    new URL('../supabase/migrations/20261002105832_rider_first_team_core.sql', import.meta.url),
    'utf8',
  );
  const projections = readFileSync(
    new URL('../supabase/migrations/20261002105859_rider_first_team_projections.sql', import.meta.url),
    'utf8',
  );
  assert.ok(projections.includes('paddock_team_region'));
  assert.ok(projections.includes('paddock_team_languages'));
  assert.ok(projections.includes('paddock_team_category'));
  assert.ok(core.includes('Create your rider profile before creating a team.'));
  assert.ok(core.includes('You are already in a team. Leave it before creating your own.'));
  assert.ok(core.includes('paddock_abandon_team'));
});


test('beta feedback makes missing fields and team building explicit', () => {
  const formSource = readFileSync(new URL('../src/app/CreateListingForm.tsx', import.meta.url), 'utf8');
  const manageSource = readFileSync(new URL('../src/app/MyListings.tsx', import.meta.url), 'utf8');
  const homeSource = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');

  assert.ok(formSource.includes('ALMOST THERE.'));
  assert.ok(formSource.includes('Please complete the highlighted fields before you continue.'));
  assert.ok(formSource.includes('validationErrors.riderGender'));
  assert.ok(formSource.includes('validationErrors.publicationConsent'));
  assert.ok(manageSource.includes('JOIN A TEAM OR BUILD YOUR OWN.'));
  assert.ok(manageSource.includes('BUILD MY TEAM'));
  assert.ok(manageSource.includes('FIND A TEAM'));
  assert.ok(homeSource.includes('Then find a team, join one, or build your own.'));
});


test('team location is shown as BASED IN and stays derived from rider data', () => {
  const pageSource = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
  const formSource = readFileSync(new URL('../src/app/CreateListingForm.tsx', import.meta.url), 'utf8');
  const projections = readFileSync(
    new URL('../supabase/migrations/20261002105859_rider_first_team_projections.sql', import.meta.url),
    'utf8',
  );

  assert.ok(pageSource.includes('BASED IN'));
  assert.ok(pageSource.includes('selectedListing.region'));
  assert.ok(!formSource.includes('name="teamRegion"'));
  assert.ok(projections.includes('group by key'));
  assert.ok(projections.includes('order by frequency desc,lower(label)'));
});
