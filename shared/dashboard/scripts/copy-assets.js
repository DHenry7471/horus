#!/usr/bin/env node
/**
 * Post-build script: copies the bundled dashboard.html template into dist/
 * so it is available at runtime without requiring src/ to be present.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '../src/dashboard.html');
const dest = path.resolve(__dirname, '../dist/dashboard.html');

fs.copyFileSync(src, dest);
console.info('Copied dashboard.html → dist/');
