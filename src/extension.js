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

    let disposable = vscode.commands.registerCommand('smartContext.copyFolderContents', async (uri) => {
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
            // Read .gitignore file if exists
            let gitignore = null;
            const gitignorePath = path.join(folderPath, '.gitignore');
            if (fs.existsSync(gitignorePath)) {
                const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
                gitignore = ignore().add(gitignoreContent);
            }

            // Function to recursively get all text files
            function get_all_text_files(dir) {
                let results = [];
                const list = fs.readdirSync(dir);
                for (let file of list) {
                    file = path.resolve(dir, file);
                    const relative_path = path.relative(folderPath, file);
                    if (gitignore && gitignore.ignores(relative_path)) {
                        continue;
                    }
                    const stat = fs.statSync(file);
                    if (stat && stat.isDirectory()) {
                        results = results.concat(get_all_text_files(file));
                    } else {
                        if (is_text_file(file)) {
                            results.push(file);
                        }
                    }
                }
                return results;
            }

            // Check for text file extensions
            function is_text_file(file_name) {
                const text_file_extensions = [
                    '.txt', '.md', '.js', '.ts', '.json', '.html', '.css', '.py', '.java',
                    '.c', '.cpp', '.cs', '.xml', '.yml', '.yaml', '.ini', '.cfg', '.conf',
                    '.log', '.sh', '.bat', '.rb', '.php', '.go', '.rs', '.swift', '.pl',
                    '.sql', '.r', '.tex', '.jsx', '.tsx', '.csv', '.mdx', '.scss', '.less',
                    '.vue', '.svelte', '.dart', '.kt', '.m', '.makefile', '.gradle', '.groovy'
                ];
                return text_file_extensions.includes(path.extname(file_name).toLowerCase());
            }

            const text_files = get_all_text_files(folderPath);

            if (text_files.length === 0) {
                vscode.window.showInformationMessage("No text files found in the selected folder.");
                return;
            }

            let content_to_copy = '';

            for (const file_path of text_files) {
                const file_content = fs.readFileSync(file_path, 'utf8');
                const relative_file_path = path.relative(folderPath, file_path);
                content_to_copy += `/${relative_file_path}:\n-----------------------\n${file_content}\n-----------------------\n\n`;
            }

            // Copy to clipboard
            await vscode.env.clipboard.writeText(content_to_copy);
            vscode.window.showInformationMessage("Folder contents copied to clipboard!");
        } catch (error) {
            vscode.window.showErrorMessage("Failed to copy folder contents: " + error.message);
        }
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
