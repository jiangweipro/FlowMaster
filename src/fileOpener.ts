import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export class FileOpener {
  private workspaceRoot: string;

  constructor() {
    const folders = vscode.workspace.workspaceFolders;
    this.workspaceRoot = folders && folders.length > 0
      ? folders[0].uri.fsPath
      : process.cwd();
  }

  async openFile(filePath: string): Promise<void> {
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
    } catch {
      // Fallback to vscode.open API
      try {
        const document = await vscode.workspace.openTextDocument(absolutePath);
        await vscode.window.showTextDocument(document, { preview: false });
      } catch (err) {
        vscode.window.showErrorMessage(
          `[FlowMaster] Failed to open file: ${String(err)}`
        );
      }
    }
  }

  async openFolder(folderPath: string): Promise<void> {
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
    } catch (err) {
      vscode.window.showErrorMessage(
        `[FlowMaster] Failed to open folder: ${String(err)}`
      );
    }
  }

  private tryOpenWithCodeCli(absolutePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use spawn with no shell to prevent command injection
      const proc = spawn('code', ['-r', absolutePath], {
        shell: false,
        windowsHide: true,
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`code CLI exited with code ${code}`));
        }
      });
    });
  }
}