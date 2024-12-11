/**
 * Strip logic and conditionals from code while preserving a minimal structural skeleton:
 * - Classes retain their structure:
 *   class Foo {
 *     methodName(){}
 *   }
 *   That is, the class opens on one line and closes on another line.
 * - Methods and functions become single-line declarations with empty bodies: `methodName(){}`.
 * - For classes, methods appear on separate lines inside the class.
 * - All internal logic and comments within methods are removed entirely (not even placeholders).
 * - Conditionals (if statements) anywhere are removed.
 * - Top-level logic lines are removed.
 * - Imports/exports and JSDoc/comments outside classes/methods remain.
 * - Class declarations open with `{` on the same line but close `}` on its own line.
 * - Method and function declarations have their closing `}` on the same line as the declaration.
 *
 * @param {string} content The original source code.
 * @returns {string} The stripped-down code.
 */
export function strip_logic_from_content(content) {
  const lines = content.split('\n');
  let result = [];
  let inJSDoc = false;

  // State tracking
  let inClass = false;          // Are we inside a class block?
  let skippingMethodBody = 0;   // How many braces deep in a method body we are (0 means not in a method body)
  
  const classOrInterfaceRegex = /^(export\s+)?(abstract\s+)?(class|interface)\s+\w+/;
  const functionDeclRegex = /^(export\s+)?(async\s+)?function\s+\w+\s*\(.*\)\s*\{?$/;
  const arrowFuncRegex = /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(.*\)\s*=>\s*\{?$/;
  const methodDeclRegexes = [
    /^(async\s+)?(constructor|get|set)\s+\w+\s*\(.*\)\s*\{?$/,
    /^(async\s+)?get\s+\w+\s*\{?$/,
    /^(async\s+)?set\s+\w+\s*\(\w*\)\s*\{?$/,
    /^((async\s+)?\w+\s*\(.*\)\s*\{?)$/
  ];

  function isJSDocStart(line) {
    return line.trim().startsWith('/**');
  }

  function isJSDocEnd(line) {
    return line.trim().endsWith('*/');
  }

  function isComment(line) {
    const trimmed = line.trim();
    return (
      trimmed.startsWith('//') ||
      (trimmed.startsWith('/*') && !isJSDocStart(line)) ||
      trimmed.endsWith('*/')
    );
  }

  function isIfStatement(line) {
    return /^\s*if\s*\(.+\)\s*\{/.test(line.trim());
  }

  function isClassOrInterfaceDecl(line) {
    return classOrInterfaceRegex.test(line.trim());
  }

  function isFunctionDecl(line) {
    const trimmed = line.trim();
    return functionDeclRegex.test(trimmed) || arrowFuncRegex.test(trimmed);
  }

  function isMethodDecl(line) {
    return methodDeclRegexes.some(r => r.test(line.trim()));
  }

  function isImportExport(line) {
    const trimmed = line.trim();
    return /^import\s+/.test(trimmed) || /^export\s+/.test(trimmed);
  }

  for (let line of lines) {
    const trimmed = line.trim();

    // If we are skipping method body lines, we only look for closing braces to end the skip
    if (skippingMethodBody > 0) {
      // Count braces to know when we've closed the method body
      if (trimmed.includes('{')) {
        skippingMethodBody++;
      }
      if (trimmed.includes('}')) {
        skippingMethodBody--;
      }
      // When skippingMethodBody returns to 0, we've closed the method body
      // We do not output any of these lines since we're removing all internal logic and comments.
      continue;
    }

    // Handle JSDoc
    if (inJSDoc) {
      result.push(line);
      if (isJSDocEnd(line)) {
        inJSDoc = false;
      }
      continue;
    }

    if (isJSDocStart(line)) {
      result.push(line);
      inJSDoc = true;
      continue;
    }

    // Remove conditionals anywhere
    if (isIfStatement(line)) {
      continue;
    }

    // Class or interface declaration
    if (isClassOrInterfaceDecl(line)) {
      // "class Foo {" -> keep as is, but ensure we don't close on same line
      // If it doesn't end with '{', add it:
      let decl = trimmed;
      if (!decl.endsWith('{')) {
        decl += ' {';
      }
      result.push(decl);
      inClass = true;
      continue;
    }

    // Closing a class
    if (trimmed === '}') {
      if (inClass) {
        // Close the class on its own line
        result.push('}');
        inClass = false;
      } else {
        // A stray closing brace outside a class? Possibly top-level, ignore or just print?
        // Ideally, no stray braces at top-level if code was well-formed.
        // If needed, just print it to maintain structure.
        result.push('}');
      }
      continue;
    }

    // Method declaration inside a class
    if (inClass && isMethodDecl(line)) {
      // Convert method to single-line empty method: methodName(){}
      // Ensure parentheses and '{}' at the end
      let decl = trimmed;
      // Remove trailing '{' if any
      decl = decl.replace(/\{\s*$/, '');
      // If no parentheses found, add them
      if (!/\(.*\)/.test(decl)) {
        decl += '(){}';
      } else {
        decl += '{}';
      }
      // Indent method
      result.push('  ' + decl);

      // The original method might have had a body. We must skip it.
      // Increase skippingMethodBody since we removed method body
      // But only if the original line had an opening '{'
      if (/\{$/.test(trimmed)) {
        // Method started a block, we must skip until we close it.
        // skippingMethodBody=1 means we are inside one block to close
        skippingMethodBody = 1;
      }
      continue;
    }

    // Top-level function declaration (outside class)
    if (!inClass && isFunctionDecl(line)) {
      // Convert function to single line empty function: funcName(){}
      let decl = trimmed;
      decl = decl.replace(/\{\s*$/, '');
      if (!/\(.*\)/.test(decl)) {
        decl += '(){}';
      } else {
        decl += '{}';
      }
      result.push(decl);
      // If original had '{', skip its body as well
      if (/\{$/.test(trimmed)) {
        skippingMethodBody = 1;
      }
      continue;
    }

    // Keep imports/exports
    if (isImportExport(line)) {
      result.push(line);
      continue;
    }

    // Keep comments and JSDoc outside classes/methods
    if (isComment(line)) {
      // If outside a method, we keep it
      // If inside method body, we would be skipping anyway
      result.push(line);
      continue;
    }

    // Everything else is logic or internal code, remove it.
  }

  // Remove trailing empty lines
  while (result.length > 0 && result[result.length - 1].trim() === '') {
    result.pop();
  }

  return result.join('\n') + '\n';
}

import assert from 'node:assert/strict';
/**
 * Test suite for the `strip_logic_from_content` method.
 * 
 * Using the same `test` object structure as demonstrated in the provided example:
 * - Optional `setup` function (not used here).
 * - `cases` array of test cases.
 * - Each test case may have a `before` function to prepare input or state.
 * - Each `assert` function runs assertions against the output of `strip_logic_from_content`.
 *
 * We will test various scenarios:
 * - Stripping logic from classes with methods.
 * - Removing `if` statements.
 * - Preserving JSDoc and top-level comments outside methods.
 * - Ensuring methods are reduced to single-line empty bodies.
 */
export const test = {
  // No global setup required for these tests
  setup: async () => {},

  cases: [
    {
      name: "removes_if_statements_in_methods",
      before: async function () {
        this.input = `
          class Foo {
            method() {
              if (condition) {
                doSomething();
              }
              let x = 42;
              // internal comment
            }
          }
        `;
      },
      assert: async function (a) {
        const output = strip_logic_from_content(this.input);
        // Expect: class Foo { method(){} }
        a.match(output, /class Foo\s*\{\s*method\(\)\{\}\s*\}/);
        a.ok(!output.includes('if('), "No if statements should remain");
        a.ok(!output.includes('internal comment'), "No internal comments should remain");
        a.ok(!output.includes('doSomething'), "No logic lines should remain");
        a.ok(!output.includes('42'), "No logic assignments should remain");
      },
    },
    {
      name: "preserves_class_structure_and_comments_outside_methods",
      before: async function () {
        this.input = `
          // Top-level comment
          /**
           * JSDoc for the class
           */
          class Bar {
            // This is inside the class but not inside a method, should be removed
            method() {
              // internal comment in method
              const y = 100;
            }
          }

          // Another top-level comment
        `;
      },
      assert: async function (a) {
        const output = strip_logic_from_content(this.input);
        // Expect a class Bar with method(){} and top-level comments and JSDoc retained
        a.match(output, /class Bar\s*\{\s*method\(\)\{\}\s*\}/);
        a.ok(output.includes('// Top-level comment'), "Top-level comment should remain");
        a.ok(output.includes('* JSDoc for the class'), "JSDoc outside methods should remain");
        a.ok(!output.includes('// This is inside the class but not inside a method'), "No extra lines inside class")
        a.ok(!output.includes('y = 100'), "No logic inside the method");
      },
    },
    {
      name: "removes_if_statements_at_top_level",
      before: async function () {
        this.input = `
          if (something) {
            doSomething();
          }
          class Baz {
            method() {
              if (anotherThing) {
                doAnother();
              }
            }
          }
        `;
      },
      assert: async function (a) {
        const output = strip_logic_from_content(this.input);
        // Expect class Baz { method(){} } only
        a.match(output, /class Baz\s*\{\s*method\(\)\{\}\s*\}/);
        a.ok(!output.includes('if (something)'), "Top-level if removed");
        a.ok(!output.includes('if (anotherThing)'), "If in method removed");
      },
    },
    {
      name: "strips_logic_but_keeps_function_structures",
      before: async function () {
        this.input = `
          export function testFn(param) {
            if (param) {
              return param * 2;
            }
            console.log("Hello");
          }
        `;
      },
      assert: async function (a) {
        const output = strip_logic_from_content(this.input);
        // Expect: export function testFn(param){}
        a.match(output, /export function testFn\(param\)\{\}/);
        a.ok(!output.includes('if('), "No if statements inside function");
        a.ok(!output.includes('console.log'), "No logic lines inside function");
      },
    },
    {
      name: "arrow_functions_become_empty",
      before: async function () {
        this.input = `
          const arrowFn = (x) => {
            if (x > 0) {
              return x;
            }
            return -1;
          };
        `;
      },
      assert: async function (a) {
        const output = strip_logic_from_content(this.input);
        // Expect: const arrowFn = (x)=>{}
        a.match(output, /const arrowFn\s*=\s*\(x\)\s*=>\{\}/);
        a.ok(!output.includes('if('), "No if statements inside arrow function");
      },
    },
  ],

  // Optional run method
  run: async () => {
    if (typeof test.setup === 'function') await test.setup();

    for (const testCase of test.cases) {
      if (typeof testCase.before === 'function') await testCase.before.call(testCase);
      await testCase.assert.call(testCase, assert);
      console.log(`Test case "${testCase.name}" passed.`);
    }

    console.log("All tests passed.");
  },
};
