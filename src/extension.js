// Copyright (c) Brian Joseph Petro

// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:

// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const ignore = require('ignore');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Activating Smart Context extension');

    let copyFolderDisposable = vscode.commands.registerCommand('smartContext.copyFolderContents', async (uri) => {
        console.log("Command executed with URI:", uri);

        if (!uri) {
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

        const folderPath = uri.fsPath;

        if (!fs.existsSync(folderPath) || !fs.lstatSync(folderPath).isDirectory()) {
            vscode.window.showErrorMessage("Please select a valid folder.");
            return;
        }

        try {
            // Read .gitignore files from the current folder and its parents
            let gitignore = ignore();
            let current_dir = folderPath;
            while (current_dir !== path.parse(current_dir).root) {
                const gitignore_path = path.join(current_dir, '.gitignore');
                if (fs.existsSync(gitignore_path)) {
                    const gitignore_content = fs.readFileSync(gitignore_path, 'utf8');
                    gitignore.add(gitignore_content);
                }
                current_dir = path.dirname(current_dir);
            }

            // Function to recursively get all text files
            function get_all_text_files(dir, base_path) {
                let results = [];
                const list = fs.readdirSync(dir);
                for (let file of list) {
                    const full_path = path.join(dir, file);
                    if (is_extraneous_file(file, full_path)) {
                        continue;
                    }

                    const relative_path = path.relative(base_path, full_path);
                    
                    if (gitignore.ignores(relative_path)) {
                        console.log(`Ignoring file/folder: ${relative_path}`);
                        continue;
                    }

                    const stat = fs.statSync(full_path);
                    if (stat && stat.isDirectory()) {
                        console.log(`Entering subfolder: ${relative_path}`);
                        results = results.concat(get_all_text_files(full_path, base_path));
                    } else if (is_text_file(full_path)) {
                        console.log(`Adding file: ${relative_path}`);
                        results.push(full_path);
                    }
                }
                return results;
            }

            // Function to generate folder structure
            function generate_folder_structure(dir, prefix = '') {
                let structure = '';
                const list = fs.readdirSync(dir);
                list.forEach((file, index) => {
                    const full_path = path.join(dir, file);
                    if (is_extraneous_file(file, full_path)) {
                        return;
                    }

                    const relative_path = path.relative(folderPath, full_path);
                    
                    if (gitignore.ignores(relative_path)) {
                        return;
                    }

                    const is_last = index === list.length - 1;
                    const connector = is_last ? '└── ' : '├── ';
                    structure += `${prefix}${connector}${file}\n`;

                    if (fs.statSync(full_path).isDirectory()) {
                        structure += generate_folder_structure(full_path, prefix + (is_last ? '    ' : '│   '));
                    }
                });
                return structure;
            }

            // Check for text file extensions
            function is_text_file(file_name) {
                const text_file_extensions = [
                    '.asm',
                    '.bat',
                    '.c',
                    '.cfg',
                    '.clj',
                    '.conf',
                    '.cpp',
                    '.cs',
                    '.css',
                    '.csv',
                    '.d',
                    '.dart',
                    '.ejs',
                    '.elm',
                    '.erl',
                    '.f',
                    '.go',
                    '.gradle',
                    '.groovy',
                    '.h',
                    '.hbs',
                    '.hpp',
                    '.hs',
                    '.html',
                    '.ini',
                    '.jade',
                    '.java',
                    '.js',
                    '.json',
                    '.jsx',
                    '.kt',
                    '.less',
                    '.lisp',
                    '.log',
                    '.lua',
                    '.m',
                    '.makefile',
                    '.md',
                    '.mdx',
                    '.ml',
                    '.mjs',
                    '.mustache',
                    '.pas',
                    '.php',
                    '.pl',
                    '.properties',
                    '.pug',
                    '.py',
                    '.r',
                    '.rb',
                    '.rs',
                    '.sass',
                    '.scala',
                    '.scheme',
                    '.scss',
                    '.sh',
                    '.sql',
                    '.svelte',
                    '.swift',
                    '.tcl',
                    '.tex',
                    '.tpl',
                    '.ts',
                    '.tsx',
                    '.twig',
                    '.txt',
                    '.vb',
                    '.vue',
                    '.xml',
                    '.yaml',
                    '.yml',

                ];
                return text_file_extensions.includes(path.extname(file_name).toLowerCase());
            }

            // Function to check for extraneous files and directories
            function is_extraneous_file(file_name, full_path) {
                const extraneous_files = ['.gitignore', '.DS_Store'];
                const extraneous_dirs = ['.git'];
                return extraneous_files.includes(file_name) || extraneous_dirs.some(dir => full_path.includes(dir));
            }
            

            console.log(`Starting to gather text files from: ${folderPath}`);
            const text_files = get_all_text_files(folderPath, folderPath);
            console.log(`Found ${text_files.length} text files`);

            if (text_files.length === 0) {
                vscode.window.showInformationMessage("No text files found in the selected folder and its subfolders.");
                return;
            }

            // Generate folder structure
            const folder_structure = generate_folder_structure(folderPath);

            let content_to_copy = `Folder Structure:\n${folder_structure}\n`;
            content_to_copy += 'File Contents:\n';

            for (const file_path of text_files) {
                const file_content = fs.readFileSync(file_path, 'utf8');
                const relative_file_path = path.relative(folderPath, file_path);
                content_to_copy += `----------------------\n/${relative_file_path.replace(/\\/g, '/')}\n-----------------------\n${file_content}\n-----------------------\n\n`;
            }

            // Copy to clipboard
            await vscode.env.clipboard.writeText(content_to_copy);
            vscode.window.showInformationMessage(`Folder contents and structure copied to clipboard! (${text_files.length} files)`);
        } catch (error) {
            vscode.window.showErrorMessage("Failed to copy folder contents: " + error.message);
        }
    });

    let copyOpenFilesDisposable = vscode.commands.registerCommand('smartContext.copyOpenFilesContents', async () => {
        console.log("Copying contents of all open files");

        const editors = vscode.window.visibleTextEditors;
        if (editors.length === 0) {
            vscode.window.showInformationMessage("No open files to copy.");
            return;
        }

        let content_to_copy = `Open Files Contents:\n`;

        for (const editor of editors) {
            const document = editor.document;
            const file_content = document.getText();
            const file_path = document.fileName;
            const relative_file_path = vscode.workspace.asRelativePath(file_path);
            
            content_to_copy += `----------------------\n/${relative_file_path.replace(/\\/g, '/')}\n-----------------------\n${file_content}\n-----------------------\n\n`;
        }

        // Copy to clipboard
        await vscode.env.clipboard.writeText(content_to_copy);
        vscode.window.showInformationMessage(`Contents of all open files copied to clipboard! (${editors.length} files)`);
    });

    context.subscriptions.push(copyFolderDisposable);
    context.subscriptions.push(copyOpenFilesDisposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
