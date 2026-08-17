#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootArgIndex = process.argv.indexOf('--root');
const root = path.resolve(rootArgIndex === -1 ? process.cwd() : process.argv[rootArgIndex + 1]);
const failures = [];
const fail = (message) => failures.push(message);
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

let manifest;
try {
  manifest = JSON.parse(read('package.json'));
} catch (error) {
  fail(`package.json cannot be read as JSON: ${error.message}`);
}

if (manifest) {
  if (manifest.packageManager !== 'pnpm@11.20.0') {
    fail(`packageManager must be exactly pnpm@11.20.0; found ${manifest.packageManager ?? 'missing'}.`);
  }
  if (manifest.engines?.node !== '24.15.0') fail('engines.node must be exactly 24.15.0.');
  if (manifest.engines?.pnpm !== '11.20.0') fail('engines.pnpm must be exactly 11.20.0.');

  const allDependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  const requiredPins = {
    next: '16.3.1',
    react: '19.2.8',
    'react-dom': '19.2.8',
    payload: '3.88.0',
    sharp: '0.34.5',
    '@payloadcms/db-postgres': '3.88.0'
  };
  for (const [name, version] of Object.entries(requiredPins)) {
    if (allDependencies[name] !== version) {
      fail(`${name} must be pinned exactly to ${version}; found ${allDependencies[name] ?? 'missing'}.`);
    }
  }
  for (const [name, version] of Object.entries(allDependencies)) {
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
      fail(`${name} must use an exact semver pin; found ${version ?? 'missing'}.`);
    }
    if (name === 'payload' || name.startsWith('@payloadcms/')) {
      if (version !== '3.88.0') fail(`${name} must be pinned exactly to 3.88.0; found ${version}.`);
    }
  }
  for (const name of ['next', 'react', 'react-dom', 'payload', 'sharp', '@payloadcms/db-postgres']) {
    const version = allDependencies[name];
    if (typeof version === 'string' && /^[~^<>=*]|\bx\b/i.test(version)) {
      fail(`${name} must not use a version range: ${version}.`);
    }
  }
}

if (!exists('pnpm-lock.yaml')) fail('pnpm-lock.yaml must be committed.');
if (!exists('.nvmrc') || read('.nvmrc').trim() !== '24.15.0') fail('.nvmrc must select Node.js 24.15.0.');
if (!exists('.node-version') || read('.node-version').trim() !== '24.15.0') {
  fail('.node-version must select Node.js 24.15.0.');
}
if (!exists('next.config.mjs') || !/output\s*:\s*['"]standalone['"]/.test(read('next.config.mjs'))) {
  fail('next.config.mjs must enable standalone output.');
}
if (!exists('tsconfig.json') || !/"@\/\*":\s*\[\s*"\.\/src\/\*"\s*\]/.test(read('tsconfig.json'))) {
  fail('tsconfig.json must define the approved @/* -> ./src/* alias.');
}
if (!exists('postcss.config.mjs') || !/tailwindcss/.test(read('postcss.config.mjs'))) {
  fail('postcss.config.mjs must configure Tailwind CSS.');
}
if (!exists('tailwind.config.ts') || !/src\/\*\*\/\*\.\{js,ts,jsx,tsx,mdx\}/.test(read('tailwind.config.ts'))) {
  fail('tailwind.config.ts must scan the src tree.');
}
if (!exists('eslint.config.mjs') || !/eslint-config-next/.test(read('eslint.config.mjs'))) {
  fail('eslint.config.mjs must configure eslint-config-next.');
}
if (!exists('src/app/(frontend)/page.tsx')) fail('the minimal App Router frontend shell is missing.');
if (!exists('src/app/(payload)')) fail('the (payload) App Router route group is missing.');
if (!exists('src/app/(frontend)')) fail('the (frontend) App Router route group is missing.');

for (const forbidden of ['pages', 'src/pages']) {
  if (exists(forbidden)) fail(`Pages Router path ${forbidden}/ is prohibited by F01-T01.`);
}
const forbiddenProductTerms = /(^|[/\\])(?:article|articles|archive|pathfinder|calculator|inquiry)(?:[/\\]|$)/i;
const productPaths = [];
const walk = (relative = '') => {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (forbiddenProductTerms.test(`/${child}`)) productPaths.push(child);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git') walk(child);
  }
};
walk('src/app');
for (const productPath of productPaths) fail(`unapproved product route or feature path found: ${productPath}`);

if (failures.length > 0) {
  console.error('F01-T01 scaffold policy failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('F01-T01 scaffold policy passed.');
