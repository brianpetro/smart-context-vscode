// Copyright (c) Brian Joseph Petro
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { strip_logic_from_content } from './strip_logic_from_content.mjs';

import {
  load_ignore_patterns,
  should_ignore,
  is_text_file
} from '../../jsbrains/smart-fs/utils/ignore.js';

/**
 * @param {vscode.ExtensionContext} context
 */
export function activate(context) {
  console.log('Activating Smart Context extension');

  let copy_folder_disposable = vscode.commands.registerCommand('smartContext.copyFolderContents', async (uri) => {
    console.log("Command executed with URI:", uri);
    await copy_folder_contents(uri, false);
  });

  let copy_open_files_disposable = vscode.commands.registerCommand('smartContext.copyOpenFilesContents', async () => {
    console.log("Copying contents of all open files or diffs, based on tab labels");
    await copy_open_files(false);
  });

  // Minimized versions
  let copy_folder_disposable_min = vscode.commands.registerCommand('smartContext.copyFolderContentsMin', async (uri) => {
    console.log("Command executed with URI for minified version:", uri);
    await copy_folder_contents(uri, true);
  });

  let copy_open_files_disposable_min = vscode.commands.registerCommand('smartContext.copyOpenFilesContentsMin', async () => {
    console.log("Copying contents (minified) of all open files or diffs, based on tab labels");
    await copy_open_files(true);
  });

  // Commands for stripping logic
  let strip_logic_folder_disposable = vscode.commands.registerCommand('smartContext.stripLogicFromMethods', async (uri) => {
    console.log("Stripping logic from folder methods with URI:", uri);
    await strip_logic_from_folder_methods(uri);
  });

  let strip_logic_open_files_disposable = vscode.commands.registerCommand('smartContext.stripLogicFromMethodsOpenFiles', async () => {
    console.log("Stripping logic from methods in all open files");
    await strip_logic_from_open_files();
  });

  context.subscriptions.push(copy_folder_disposable);
  context.subscriptions.push(copy_open_files_disposable);
  context.subscriptions.push(copy_folder_disposable_min);
  context.subscriptions.push(copy_open_files_disposable_min);
  context.subscriptions.push(strip_logic_folder_disposable);
  context.subscriptions.push(strip_logic_open_files_disposable);
}

export function deactivate() {}

/**
 * Copy the contents of a folder to clipboard, optionally minifying the content.
 * @param {vscode.Uri|undefined} uri
 * @param {boolean} minify
 */
async function copy_folder_contents(uri, minify) {
  if (!uri || !uri.fsPath) {
    uri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Folder'
    });
    if (!uri || uri.length === 0) {
      vscode.window.showErrorMessage("No folder selected.");
      return;
    }
    uri = uri[0];
  }

  const folder_path = uri.fsPath;

  if (!fs.existsSync(folder_path) || !fs.lstatSync(folder_path).isDirectory()) {
    vscode.window.showErrorMessage("Please select a valid folder.");
    return;
  }

  try {
    // Gather all ignore patterns from this folder up to the root
    const ignore_patterns = load_ignore_patterns(folder_path);

    console.log(`Starting to gather text files from: ${folder_path}`);
    const text_files = get_all_text_files(folder_path, folder_path, ignore_patterns);
    console.log(`Found ${text_files.length} text files`);

    if (text_files.length === 0) {
      vscode.window.showInformationMessage("No text files found in the selected folder and its subfolders.");
      return;
    }

    const folder_structure = generate_folder_structure(folder_path, '', folder_path, ignore_patterns);
    const folder_name = path.basename(folder_path);
    let content_to_copy = `${folder_name} Folder Structure:\n${folder_structure}\n`;
    content_to_copy += minify ? 'File Contents (Minified):\n' : 'File Contents:\n';

    for (const file_path of text_files) {
      const file_content = fs.readFileSync(file_path, 'utf8');
      const relative_file_path = path.relative(folder_path, file_path);
      let final_content = minify ? minify_content(file_content) : file_content;
      content_to_copy += `----------------------\n/${relative_file_path.replace(/\\/g, '/')}\n-----------------------\n${final_content}\n-----------------------\n\n`;
    }

    await vscode.env.clipboard.writeText(content_to_copy);
    vscode.window.showInformationMessage(`Folder contents ${minify ? "(minified) " : ""}copied to clipboard! (${text_files.length} files)`);
  } catch (error) {
    vscode.window.showErrorMessage("Failed to copy folder contents: " + error.message);
  }
}

/**
 * Copy contents of all currently visible text editors to clipboard (optionally minified).
 * We use the actual tab label to decide if it's a normal file vs. a "(Working Tree)" or "(Index)".
 * @param {boolean} minify
 */
async function copy_open_files(minify) {
  const editors = vscode.window.visibleTextEditors;
  if (editors.length === 0) {
    vscode.window.showInformationMessage("No open files to copy.");
    return;
  }

  let content_to_copy = minify ? "Open Files Contents (Minified):\n" : "Open Files Contents:\n";
  const tabs = [];

  for (const editor of editors) {
    const tab_label = get_tab_label_for_editor(editor) || path.basename(editor.document.fileName);
    const tab_uri = editor.document.uri.toString();
    const file_path = JSON.parse(decodeURIComponent(tab_uri.split('?')?.[1] || '{}'))?.path || '';

    if (tabs.includes(tab_label)) {
      continue; // Skip duplicates
    }
    tabs.push(tab_label);
    // Check the tab label for suffixes
    const is_working_tree = tab_label.endsWith('(Working Tree)');
    const is_index = tab_label.endsWith('(Index)');

    if (!is_working_tree && !is_index) {
      // Normal file
      const file_content = editor.document.getText();
      let final_content = minify ? minify_content(file_content) : file_content;
      const relative_file_path = vscode.workspace.asRelativePath(editor.document.fileName);
      let codeblock_name = get_codeblock_name(editor);

      content_to_copy += `----------------------\n/${relative_file_path.replace(/\\/g, '/')}\n-----------------------\n\`\`\`${codeblock_name}\n${final_content}\n\`\`\`\n\n`;
    } else {
      // Diff-like tab
      // The tab label might be something like "myfile.js (Working Tree)" or "myfile.js (Index)"
      // Let's parse out the real filename if possible.
      // const raw_label = tab_label.replace(' (Working Tree)', '').replace(' (Index)', '').trim();
      // If we can locate the real path in workspace, do so:
      // let real_file_path = get_file_path_from_workspace(raw_label);
      // // if (!real_file_path) {
      // //   // fallback: just do the label as-is
      // //   real_file_path = raw_label;
      // }

      // Working Tree => `git diff`
      // Index => `git diff --cached`
      let diff_text = is_working_tree
        ? get_git_diff_for_file(file_path, false)
        : get_git_diff_for_file(file_path, true);

      let suffix_msg = '';
      let codeblock_name = '';
      if(diff_text===""){
        // use the file contents instead
        const file_content = editor.document.getText();
        diff_text = minify ? minify_content(file_content) : file_content;
        suffix_msg = 'File Contents';
        codeblock_name = get_codeblock_name(editor);
      } else {
        codeblock_name = 'diff';
        suffix_msg = is_working_tree ? 'Working Tree Diff' : 'Staged Diff';
      }
      content_to_copy += `----------------------\n${tab_label}\n-----------------------\n${suffix_msg}:\n\`\`\`${codeblock_name}\n${diff_text}\n\`\`\`\n\n`;
    }
  }

  await vscode.env.clipboard.writeText(content_to_copy);
  vscode.window.showInformationMessage([
    `Contents of all open files or diffs ${minify ? "(minified) " : ""}copied to clipboard! (${editors.length} tabs)\n`,
    `Tabs: ${tabs.join(', ')}`
  ].join('\n'));
}

function get_codeblock_name(editor) {
  let codeblock_name = path.extname(editor.document.fileName).slice(1);
  if (['mjs', 'cjs'].includes(codeblock_name)) {
    codeblock_name = 'js';
  }
  return codeblock_name;
}

/**
 * Returns the tab label from the Tab API if we can find a matching tab
 * for the given editor's document URI. If no tab is found, returns undefined.
 * @param {vscode.TextEditor} editor
 * @returns {string | undefined}
 */
function get_tab_label_for_editor(editor) {
  const editor_uri_str = editor.document.uri.toString();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (!tab.input) continue;

      // For a standard text file
      if (tab.input.uri && tab.input.uri.toString() === editor_uri_str) {
        return tab.label;
      }

      // For a text diff input: check original/modified URIs
      if (tab.input.modified && tab.input.modified.toString() === editor_uri_str) {
        return tab.label;
      }
      if (tab.input.original && tab.input.original.toString() === editor_uri_str) {
        return tab.label;
      }
    }
  }
  return undefined;
}

/**
 * Attempt to find an absolute file path in the workspace matching
 * a "raw" label. For instance, if the label is "testfile.js",
 * we look for that in each workspace folder. If not found, returns undefined.
 * @param {string} label
 * @returns {string|undefined}
 */
function get_file_path_from_workspace(label) {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return undefined;
  }
  for (const folder of vscode.workspace.workspaceFolders) {
    const candidate = path.join(folder.uri.fsPath, label);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Find the absolute path to the nearest Git repo (the folder containing .git)
 * by traversing upward from a file or folder path. Returns undefined
 * if no .git folder is found before reaching the root.
 *
 * @param {string} start_path - The file or directory path to start searching from.
 * @returns {string | undefined} The absolute path to the Git repo folder, or undefined.
 */
function find_nearest_git_repo(start_path) {
  let current_dir = start_path;
  // If the path is a file, move up to its parent directory
  if (fs.existsSync(current_dir) && fs.statSync(current_dir).isFile()) {
    current_dir = path.dirname(current_dir);
  }

  // Traverse upward until we find .git or reach root
  while (true) {
    const git_path = path.join(current_dir, '.git');
    if (fs.existsSync(git_path)) {
      return current_dir;
    }

    const parent_dir = path.dirname(current_dir);
    if (parent_dir === current_dir) {
      // Reached root without finding .git
      return undefined;
    }

    current_dir = parent_dir;
  }
}

/**
 * Get the Git diff for a specific file, optionally for staged changes only.
 * If Git or the file is not in a Git repo, returns an empty string.
 * @param {string} file_path
 * @param {boolean} staged_only
 * @returns {string}
 */
function get_git_diff_for_file(file_path, staged_only) {
  const git_repo_path = find_nearest_git_repo(file_path);
  if (!git_repo_path) {
    return '';
  }

  try {
    const command = staged_only
      ? `git diff --cached -- "${file_path}"`
      : `git diff -- "${file_path}"`;
    const diff = execSync(command, { encoding: 'utf8', cwd: git_repo_path });
    return diff;
  } catch (err) {
    // If Git fails or file is not in a Git repo, we return empty
    return '';
  }
}

/**
 * Strip logic from methods in a folder's files.
 * @param {vscode.Uri|undefined} uri
 */
async function strip_logic_from_folder_methods(uri) {
  if (!uri || !uri.fsPath) {
    uri = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Folder'
    });
    if (!uri || uri.length === 0) {
      vscode.window.showErrorMessage("No folder selected.");
      return;
    }
    uri = uri[0];
  }

  const folder_path = uri.fsPath;

  if (!fs.existsSync(folder_path) || !fs.lstatSync(folder_path).isDirectory()) {
    vscode.window.showErrorMessage("Please select a valid folder.");
    return;
  }

  try {
    // Gather ignore patterns
    const ignore_patterns = load_ignore_patterns(folder_path);

    console.log(`Starting to gather text files for logic stripping from: ${folder_path}`);
    const text_files = get_all_text_files(folder_path, folder_path, ignore_patterns);
    console.log(`Found ${text_files.length} text files`);

    if (text_files.length === 0) {
      vscode.window.showInformationMessage("No text files found to process in the selected folder and its subfolders.");
      return;
    }

    const folder_structure = generate_folder_structure(folder_path, '', folder_path, ignore_patterns);
    const folder_name = path.basename(folder_path);
    let content_to_copy = `${folder_name} Folder Structure:\n${folder_structure}\nStripped Methods (Logic Removed):\n`;

    for (const file_path of text_files) {
      const file_content = fs.readFileSync(file_path, 'utf8');
      const relative_file_path = path.relative(folder_path, file_path);
      const stripped_content = strip_logic_from_content(file_content);
      content_to_copy += `----------------------\n/${relative_file_path.replace(/\\/g, '/')}\n-----------------------\n${stripped_content}\n-----------------------\n\n`;
    }

    await vscode.env.clipboard.writeText(content_to_copy);
    vscode.window.showInformationMessage(`Folder methods stripped of logic and copied to clipboard! (${text_files.length} files)`);
  } catch (error) {
    vscode.window.showErrorMessage("Failed to strip logic from folder methods: " + error.message);
  }
}

/**
 * Strip logic from methods in all currently visible text editors.
 */
async function strip_logic_from_open_files() {
  const editors = vscode.window.visibleTextEditors;
  if (editors.length === 0) {
    vscode.window.showInformationMessage("No open files to process.");
    return;
  }

  let content_to_copy = "Open Files Methods (Logic Removed):\n";

  for (const editor of editors) {
    const document = editor.document;
    const file_content = document.getText();
    const file_path = document.fileName;
    const relative_file_path = vscode.workspace.asRelativePath(file_path);

    const stripped_content = strip_logic_from_content(file_content);
    content_to_copy += `----------------------\n/${relative_file_path.replace(/\\/g, '/')}\n-----------------------\n${stripped_content}\n-----------------------\n\n`;
  }

  await vscode.env.clipboard.writeText(content_to_copy);
  vscode.window.showInformationMessage(`Methods in open files stripped of logic and copied to clipboard! (${editors.length} files)`);
}

/**
 * Recursively gather all text files from a directory, skipping those that match any ignore pattern.
 * @param {string} dir - Current directory being processed.
 * @param {string} base_path - The top-level path to relativize.
 * @param {string[]} ignore_patterns - The loaded ignore patterns from the utility.
 * @returns {string[]} An array of absolute paths to text files.
 */
function get_all_text_files(dir, base_path, ignore_patterns) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (let file of list) {
    const full_path = path.join(dir, file);

    // Build the relative path (for ignoring)
    const relative_path = path.relative(base_path, full_path).replace(/\\/g, '/');

    // Check if we skip
    if (should_ignore(relative_path, ignore_patterns) || is_extraneous_file(file, full_path)) {
      console.log(`Ignoring file/folder: ${relative_path}`);
      continue;
    }

    const stat = fs.statSync(full_path);
    if (stat && stat.isDirectory()) {
      console.log(`Entering subfolder: ${relative_path}`);
      results = results.concat(get_all_text_files(full_path, base_path, ignore_patterns));
    } else if (is_text_file(full_path)) {
      console.log(`Adding file: ${relative_path}`);
      results.push(full_path);
    }
  }
  return results;
}

/**
 * Generate an ASCII folder structure, skipping ignored files/folders.
 * @param {string} dir
 * @param {string} prefix
 * @param {string} base_path
 * @param {string[]} ignore_patterns
 * @returns {string} ASCII-art style representation of the folder tree.
 */
function generate_folder_structure(dir, prefix, base_path, ignore_patterns) {
  let structure = '';
  const list = fs.readdirSync(dir);

  list.forEach((file, index) => {
    const full_path = path.join(dir, file);
    const relative_path = path.relative(base_path, full_path).replace(/\\/g, '/');
    if (should_ignore(relative_path, ignore_patterns) || is_extraneous_file(file, full_path)) {
      return;
    }

    const is_last = index === list.length - 1;
    const connector = is_last ? '└── ' : '├── ';
    structure += `${prefix}${connector}${file}\n`;

    if (fs.statSync(full_path).isDirectory()) {
      structure += generate_folder_structure(
        full_path,
        prefix + (is_last ? '    ' : '│   '),
        base_path,
        ignore_patterns
      );
    }
  });
  return structure;
}

/**
 * Certain files/folders we always skip, regardless of ignore files.
 * @param {string} file_name
 * @param {string} full_path
 * @returns {boolean}
 */
function is_extraneous_file(file_name, full_path) {
  const extraneous_files = ['.gitignore', '.scignore', '.DS_Store'];
  const extraneous_dirs = ['.git'];
  if (extraneous_files.includes(file_name)) {
    return true;
  }
  return extraneous_dirs.some(dir => full_path.includes(dir));
}

/**
 * Minify file content by removing comments and extraneous whitespace.
 * @param {string} content
 * @returns {string}
 */
function minify_content(content) {
  // Remove block comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single line comments //
  content = content.replace(/\/\/[^\r\n]*/g, '');
  // Remove single line comments #
  content = content.replace(/^[ \t]*#[^\r\n]*/gm, '');
  // Trim lines and remove excessive whitespace
  let lines = content.split('\n');
  let processed_lines = [];
  for (let line of lines) {
    line = line.trim();
    if (line.length > 0) {
      line = line.replace(/\s+/g, ' ');
      processed_lines.push(line);
    }
  }
  return processed_lines.join('\n');
}
