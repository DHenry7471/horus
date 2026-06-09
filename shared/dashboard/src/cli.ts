#!/usr/bin/env node
/**
 * horus-dashboard CLI
 *
 * Usage:
 *   horus-dashboard [options]
 *
 * Options:
 *   --reportsDir  <path>   Absolute or relative path to reports directory.
 *                          Defaults to <cwd>/reports
 *   --outputDir   <path>   Where to write the generated site.
 *                          Defaults to <cwd>/quality-dashboard/dist
 *   --template    <path>   Path to a custom HTML template.
 *   --maxRuns     <n>      Max history runs to retain (default: 30).
 *   --help                 Print this message.
 */

import path from 'path';
import { generate } from './generate.js';
import type { HorusDashboardConfig } from './types.js';

function parseArgs(argv: string[]): HorusDashboardConfig & { help?: boolean } {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  return {
    help: args.includes('--help') || args.includes('-h'),
    reportsDir: path.resolve(get('--reportsDir') ?? 'reports'),
    outputDir: path.resolve(get('--outputDir') ?? path.join('quality-dashboard', 'dist')),
    templatePath: get('--template') ? path.resolve(get('--template')!) : undefined,
    maxHistoryRuns: get('--maxRuns') ? parseInt(get('--maxRuns')!, 10) : undefined,
  };
}

const config = parseArgs(process.argv);

if (config.help) {
  console.log(`
horus-dashboard — generate the Horus quality observatory

Usage:
  horus-dashboard [options]

Options:
  --reportsDir  <path>   Path to reports directory  (default: ./reports)
  --outputDir   <path>   Output directory            (default: ./quality-dashboard/dist)
  --template    <path>   Custom HTML template
  --maxRuns     <n>      Max history runs to keep    (default: 30)
  --help                 Print this help
`);
  process.exit(0);
}

generate(config).catch((err: unknown) => {
  console.error('Dashboard generation failed:', err);
  process.exit(1);
});
