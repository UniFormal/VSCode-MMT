import * as vscode from 'vscode';
import { readFile } from 'fs/promises';
import { MMTLogEntry, MMTShellViewLogMessage } from './messages';
import { MMTLanguageClient } from './client';

export class MMTShell implements vscode.WebviewViewProvider {
    static viewId = "mmtshell";

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri, private readonly getClient: () => MMTLanguageClient|null) { }

    async resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext<unknown>, token: vscode.CancellationToken) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'src/shellview')],
        };

        webviewView.webview.html = await readFile(
            vscode.Uri
                .joinPath(this._extensionUri, "src/shellview/index.html")
                .with({ scheme: 'vscode-resource' })
                .fsPath,
            {
                encoding: "utf-8"
            }
        );
        // TODO: how to dispose of this?
        webviewView.webview.onDidReceiveMessage(event => {
            switch (event.kind) {
                case "handleline":
                    this.getClient()?.handleLine(event.msg);
                    break;
                default:
                    console.error("MMTShellView received unknown message:");
                    console.error(event);
            }
        });
    }

    log(msg: MMTLogEntry) {
        if (this._view) {
            this._view.webview.postMessage(new MMTShellViewLogMessage(msg));
        }
    }
}
