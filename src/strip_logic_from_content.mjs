/**
 * Strip logic and conditionals from code while preserving a minimal structural skeleton:
 * - Classes retain their structure and each method on its own line:
 *   class Foo {
 *     methodName(){}
 *   }
 * - Methods and functions become single-line declarations with empty bodies: `methodName(){}`.
 * - All internal logic and comments within methods are removed.
 * - Non-method lines inside classes are removed.
 * - Conditionals (if statements) anywhere are removed.
 * - Top-level logic lines (outside of classes/functions) are removed.
 * - Imports/exports and JSDoc/comments outside classes/methods remain.
 * - Class declarations open with `{` on the same line and close `}` on its own line.
 * - For all functions/methods and arrow functions, no extra spaces before `{}`: `method(){}`, `functionName(param){}`, `(x)=>{}`.
 *
 * @param {string} content The original source code.
 * @returns {string} The stripped-down code.
 */
export function strip_logic_from_content(content) {
  const lines = content.split('\n');
  let result = [];
  let inJSDoc = false;
  let inClass = false;
  let skippingMethodBody = 0; // how many braces deep in a method body we are

  const classOrInterfaceRegex = /^(export\s+)?(abstract\s+)?(class|interface)\s+\w+/;
  const functionDeclRegex = /^(export\s+)?(async\s+)?function\s+\w+\s*\(.*\)\s*\{?$/;
  const arrowFuncRegex = /^(export\s+)?(const|let|var)\s+\w+\s*=\s*(async\s+)?\(.*\)\s*=>\s*\{?$/;
  const methodDeclRegexes = [
    /^(async\s+)?(constructor|get|set)\s*\(.*\)\s*\{?$/,
    /^(async\s+)?get\s+\w+\s*\(\)\s*\{?$/,
    /^(async\s+)?set\s+\w+\s*\(.*\)\s*\{?$/,
    /^(async\s+)?\w+\s*\(.*\)\s*\{?$/
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
    const trimmed = line.trim();
    return methodDeclRegexes.some(r => r.test(trimmed));
  }

  function isImportExport(line) {
    const trimmed = line.trim();
    return /^import\s+/.test(trimmed) || /^export\s+/.test(trimmed);
  }

  /**
   * Finalize a declaration by ensuring it ends with empty braces `{}` without extra spaces.
   * For arrow functions: `(x)=>{}`
   * For normal functions/methods: `funcName(param){}`
   * No extra spaces before `{}` in any case.
   */
  function finalizeDeclaration(decl) {
    // Remove trailing '{'
    decl = decl.replace(/\{\s*$/, '');

    // If no parentheses, add them before adding the body
    if (!/\(.*\)/.test(decl)) {
      decl += '()';
    }

    // Add empty body
    decl += '{}';

    // Remove spaces before '{}'
    decl = decl.replace(/\s+\{\}/, '{}');

    // For arrow functions, remove spaces around '=>'
    // `(x) => {}` -> `(x)=>{}`
    decl = decl.replace(/\)\s*=>\s*\{\}/, ')=>{}');

    return decl;
  }

  for (let line of lines) {
    const trimmed = line.trim();

    if (skippingMethodBody > 0) {
      if (trimmed.includes('{')) skippingMethodBody++;
      if (trimmed.includes('}')) skippingMethodBody--;
      continue;
    }

    // Handle JSDoc
    if (inJSDoc) {
      result.push(line);
      if (isJSDocEnd(line)) inJSDoc = false;
      continue;
    }

    if (isJSDocStart(line)) {
      result.push(line);
      inJSDoc = true;
      continue;
    }

    // Remove if statements entirely
    if (isIfStatement(line)) {
      continue;
    }

    // Class or interface
    if (isClassOrInterfaceDecl(line)) {
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
        result.push('}');
        inClass = false;
      }
      continue;
    }

    if (inClass) {
      // Inside class: only method declarations
      if (isMethodDecl(line)) {
        let decl = finalizeDeclaration(trimmed);
        result.push('  ' + decl);
        if (/\{$/.test(trimmed)) {
          skippingMethodBody = 1;
        }
      }
      continue;
    }

    // Top-level function or arrow function
    if (isFunctionDecl(line)) {
      let decl = finalizeDeclaration(trimmed);
      result.push(decl);
      if (/\{$/.test(trimmed)) {
        skippingMethodBody = 1;
      }
      continue;
    }

    // Keep imports/exports/comments outside classes/methods
    if (isImportExport(line) || isComment(line) || inJSDoc) {
      result.push(line);
      continue;
    }

    // Remove other top-level logic
  }

  while (result.length > 0 && result[result.length - 1].trim() === '') {
    result.pop();
  }

  return result.join('\n') + '\n';
}

export const test = {
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
        a.ok(output.includes("class Foo {\n  method() {}\n}"), "Class with a single method should match the multiline structure");
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
        // Updated pattern to allow any whitespace and comments inside the class before the method
        a.match(output, /class Bar\s*\{\s*[\s\S]*method\(\)\{\}[\s\S]*\}/);
        a.ok(output.includes('// Top-level comment'), "Top-level comment should remain");
        a.ok(output.includes('* JSDoc for the class'), "JSDoc outside methods should remain");
        a.ok(!output.includes('// This is inside the class but not inside a method'), "No extra lines inside class");
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
        // Updated pattern to allow any whitespace inside the class before the method
        a.match(output, /class Baz\s*\{\s*[\s\S]*method\(\)\{\}[\s\S]*\}/);
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
};
