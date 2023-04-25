import * as vscode from 'vscode';
import * as language from 'vscode-languageclient/node';
import * as debounce from "debounce";
import { assert } from 'console';
import { MMTLanguageClient, launchMMT } from './client';
import { outputChannel } from './output-channel';
/**
 * invariant: if in extension context 'mmt.loaded' is true, then client is non-null and client?.state === State.Running.
 *
 * todo: correct invariant documentation
 */
let client: MMTLanguageClient|null = null;

export function activate(context: vscode.ExtensionContext) {
	vscode.commands.executeCommand('setContext', 'mmt.loaded', false);

	context.subscriptions.push(vscode.commands.registerCommand("mmt.typecheck", () => {
		const doc = vscode.window.activeTextEditor?.document;
		if (doc) {
			client?.typecheck(doc);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand("mmt.buildmmtomdoc", () => {
		const doc = vscode.window.activeTextEditor?.document;
		if (doc) {
			doc.save().then(hasSaved => {
				if (!hasSaved) {
					vscode.window.showErrorMessage(
						`Could not save ${doc.fileName} before building to mmt-omdoc. Build results may be outdated.`
					);
				}
				client?.buildMMTOmdoc(doc);
			});
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand("mmt.reload", () => {
		vscode.commands.executeCommand('setContext', 'mmt.loaded', false);
		client?.dispose();

		// remove previous subscription of client
		const idx = context.subscriptions.findIndex(sub => sub !== client);
		if (idx !== -1) {
			context.subscriptions.splice(idx, 1); 
		}

		client = null;
		loadMMTClient(context);
	}));

	const checkTimeout = vscode.workspace.getConfiguration("mmt").get<number>("checkTimeout") || -1;
	assert(checkTimeout === -1 || checkTimeout >= 0);

	if (checkTimeout !== -1) {
		const debouncedCheck = debounce((event: vscode.TextDocumentChangeEvent) => {
			client?.typecheck(event.document);
		}, checkTimeout);

		context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId !== 'mmt') {
				return;
			}

			debouncedCheck(event);
		}));
	}

	const saveBuildTimeout = vscode.workspace.getConfiguration("mmt").get<number>("saveBuildTimeout") || -1;
	assert(saveBuildTimeout === -1 || saveBuildTimeout >= 0);

	if (saveBuildTimeout !== -1) {
		const debouncedSaveBuild = debounce((event: vscode.TextDocumentChangeEvent) => {
			event.document.save().then(hasSaved => {
				if (hasSaved) {
					client?.buildMMTOmdoc(event.document);
				}
			});
		}, saveBuildTimeout);

		context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId !== 'mmt') {
				return;
			}

			debouncedSaveBuild(event);
		}));
	}

	loadMMTClient(context);
}

function loadMMTClient(context: vscode.ExtensionContext) {
	if (client !== null) {
		vscode.window.showErrorMessage("Internal error of MMT extension: " +
			"we were instructed to reload the client despite client !== null yet.");
		return;
	}
	vscode.window.showInformationMessage("MMT client loading...");

	if (vscode.workspace.workspaceFolders) {
		const projectHome = vscode.workspace.workspaceFolders[0].uri.fsPath;
		launchMMT(context, projectHome).then(newClient => {
			newClient.onDidChangeState(event => {
				switch (event.newState) {
					case language.State.Running:
						vscode.commands.executeCommand('setContext', 'mmt.loaded', true);
						vscode.window.showInformationMessage("MMT client loaded.");
						break;

					case language.State.Stopped:
						vscode.commands.executeCommand('setContext', 'mmt.loaded', false);
						vscode.window.showInformationMessage("Try reloading the MMT client.", "reload").then(choice => {
							if (choice === "reload") {
								vscode.commands.executeCommand("mmt.reload");
							}
						});
						break;
				}
				client = newClient;
			});
			context.subscriptions.push(newClient);
		})
		.catch(console.error.bind(console));
	} else {
		outputChannel.appendLine("MMT will not start because you've opened a single file and not a project directory.");
	}
}

export function deactivate() {
}
