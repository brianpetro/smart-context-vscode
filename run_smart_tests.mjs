import assert from 'node:assert/strict';
import { test, strip_logic_from_content } from './src/strip_logic_from_content.mjs';

async function run_tests() {
    if (typeof test.setup === 'function') await test.setup();

    let passed = 0;
    let failed = 0;
    for (const testCase of test.cases) {
        if (typeof testCase.before === 'function') await testCase.before.call(testCase);
        try {
            await testCase.assert.call(testCase, assert);
            console.log(`✅ Test case "${testCase.name}" passed.`);
            passed++;
        } catch (error) {
            console.error(`❌ Test case "${testCase.name}" failed:`, error);
            failed++;
        }
    }

    console.log(`All tests run: ${passed} passed, ${failed} failed.`);
    
    if (failed > 0) {
        process.exit(1);
    }
}

try {
    await run_tests();
} catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
}