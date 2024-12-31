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
import { strip_logic_from_content } from './strip_logic_from_content.mjs';

import { load_ignore_patterns, should_ignore } from '../../jsbrains/smart-fs/utils/ignore_utility.js';

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
        console.log("Copying contents of all open files");
        await copy_open_files(false);
    });

    // Minimized versions
    let copy_folder_disposable_min = vscode.commands.registerCommand('smartContext.copyFolderContentsMin', async (uri) => {
        console.log("Command executed with URI for minified version:", uri);
        await copy_folder_contents(uri, true);
    });

    let copy_open_files_disposable_min = vscode.commands.registerCommand('smartContext.copyOpenFilesContentsMin', async () => {
        console.log("Copying contents of all open files (minified)");
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
 * Copy the contents of all currently visible text editors to clipboard.
 * @param {boolean} minify
 */
async function copy_open_files(minify) {
    const editors = vscode.window.visibleTextEditors;
    if (editors.length === 0) {
        vscode.window.showInformationMessage("No open files to copy.");
        return;
    }

    let content_to_copy = minify ? "Open Files Contents (Minified):\n" : "Open Files Contents:\n";

    for (const editor of editors) {
        const document = editor.document;
        const file_content = document.getText();
        const file_path = document.fileName;
        const relative_file_path = vscode.workspace.asRelativePath(file_path);

        let final_content = minify ? minify_content(file_content) : file_content;
        content_to_copy += `----------------------\n/${relative_file_path.replace(/\\/g, '/')}\n-----------------------\n${final_content}\n-----------------------\n\n`;
    }

    await vscode.env.clipboard.writeText(content_to_copy);
    vscode.window.showInformationMessage(`Contents of all open files ${minify ? "(minified) " : ""}copied to clipboard! (${editors.length} files)`);
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
 * Determine if a file is a text file by extension.
 * @param {string} file_name
 * @returns {boolean}
 */
function is_text_file(file_name) {
    const text_file_extensions = [
        '.asm', '.bat', '.c', '.cfg', '.clj', '.conf', '.cpp', '.cs', '.css', '.csv', '.d', '.dart', '.ejs', '.elm',
        '.erl', '.f', '.go', '.gradle', '.groovy', '.h', '.hbs', '.hpp', '.hs', '.html', '.ini', '.jade', '.java',
        '.js', '.json', '.jsx', '.kt', '.less', '.lisp', '.log', '.lua', '.m', '.makefile', '.md', '.mdx', '.ml',
        '.mjs', '.mustache', '.pas', '.php', '.pl', '.properties', '.pug', '.py', '.r', '.rb', '.rs', '.sass',
        '.scala', '.scheme', '.scss', '.sh', '.sql', '.svelte', '.swift', '.tcl', '.tex', '.tpl', '.ts', '.tsx',
        '.twig', '.txt', '.vb', '.vue', '.xml', '.yaml', '.yml'
    ];
    return text_file_extensions.includes(path.extname(file_name).toLowerCase());
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
