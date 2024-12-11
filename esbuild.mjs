/**
 * @fileoverview Build script for bundling the extension using esbuild.
 * @version 1.0.0
 */

/**
 * Build the extension using esbuild.
 * This script bundles src/extension.js into dist/extension.js
 * and includes strip_logic_from_content.js.
 */

import { build } from 'esbuild';
import path from 'path';

(async function run_build() {
    try {
        await build({
            entryPoints: [path.join('.', 'src', 'extension.mjs')],
            bundle: true,
            platform: 'node',
            format: 'cjs',
            target: 'node18',
            outfile: path.join('.', 'dist', 'extension.js'),
            external: ['vscode']
        });
        console.log('Build completed successfully.');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
})();
