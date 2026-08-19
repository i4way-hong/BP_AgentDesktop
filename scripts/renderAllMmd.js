#!/usr/bin/env node
/* Render all .mmd files under docs/diagrams to PNG using mermaid-cli */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const diagramsDir = path.resolve(repoRoot, 'docs', 'diagrams');
const mermaidConfig = path.resolve(repoRoot, 'mermaid.config.json');

function listMmdFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...listMmdFiles(p));
    } else if (e.isFile() && p.toLowerCase().endsWith('.mmd')) {
      files.push(p);
    }
  }
  return files;
}

function runMmdc(input, output) {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'npx.cmd' : 'npx';
  const args = ['mmdc', '-i', input, '-o', output, '-C', mermaidConfig];
  const res = spawnSync(cmd, args, { stdio: 'inherit', cwd: repoRoot });
  if (res.error || res.status !== 0) {
    throw res.error || new Error(`mmdc failed for ${input}`);
  }
}

function main() {
  if (!fs.existsSync(diagramsDir)) {
    console.error(`Diagrams directory not found: ${diagramsDir}`);
    process.exit(1);
  }
  const files = listMmdFiles(diagramsDir);
  if (files.length === 0) {
    console.log('No .mmd files found.');
    return;
  }
  console.log(`Rendering ${files.length} diagram(s)...`);
  for (const mmd of files) {
    const out = mmd.replace(/\.mmd$/i, '.png');
    console.log(`- ${path.relative(repoRoot, mmd)} -> ${path.relative(repoRoot, out)}`);
    runMmdc(mmd, out);
  }
  console.log('Done.');
}

main();
