"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileOpener = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
class FileOpener {
    constructor() {
        const folders = vscode.workspace.workspaceFolders;
        this.workspaceRoot = folders && folders.length > 0
            ? folders[0].uri.fsPath
            : process.cwd();
    }
    async openFile(filePath) {
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(this.workspaceRoot, filePath);
        if (!fs.existsSync(absolutePath)) {
            vscode.window.showErrorMessage(`[FlowMaster] File not found: ${absolutePath}`);
            return;
        }
        try {
            // Try using code CLI first (safe: spawn with no shell)
            await this.tryOpenWithCodeCli(absolutePath);
        }
        catch {
            // Fallback to vscode.open API
            try {
                const document = await vscode.workspace.openTextDocument(absolutePath);
                await vscode.window.showTextDocument(document, { preview: false });
            }
            catch (err) {
                vscode.window.showErrorMessage(`[FlowMaster] Failed to open file: ${String(err)}`);
            }
        }
    }
    async openFolder(folderPath) {
        const absolutePath = path.isAbsolute(folderPath)
            ? folderPath
            : path.join(this.workspaceRoot, folderPath);
        if (!fs.existsSync(absolutePath)) {
            vscode.window.showErrorMessage(`[FlowMaster] Folder not found: ${absolutePath}`);
            return;
        }
        try {
            const uri = vscode.Uri.file(absolutePath);
            await vscode.commands.executeCommand('revealInExplorer', uri);
        }
        catch (err) {
            vscode.window.showErrorMessage(`[FlowMaster] Failed to open folder: ${String(err)}`);
        }
    }
    tryOpenWithCodeCli(absolutePath) {
        return new Promise((resolve, reject) => {
            // Use spawn with no shell to prevent command injection
            const proc = (0, child_process_1.spawn)('code', ['-r', absolutePath], {
                shell: false,
                windowsHide: true,
            });
            proc.on('error', reject);
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                }
                else {
                    reject(new Error(`code CLI exited with code ${code}`));
                }
            });
        });
    }
}
exports.FileOpener = FileOpener;
//# sourceMappingURL=fileOpener.js.map