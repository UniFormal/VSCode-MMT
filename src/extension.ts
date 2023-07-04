import * as vscode from 'vscode';
import * as language from 'vscode-languageclient/node';
import debounce from "debounce";
import { assert } from 'console';
import { MMTLanguageClient, launchMMT } from './client';
import { outputChannel } from './output-channel';
import { MMTShell } from './shellview';
import { MMTLogEntry } from './messages';
/**
 * invariant: if in extension context 'mmt.loaded' is true, then client is non-null and client?.state === State.Running.
 *
 * todo: correct invariant documentation
 */
let client: MMTLanguageClient|null = null;

export function activate(context: vscode.ExtensionContext) {
	vscode.commands.executeCommand('setContext', 'mmt.loaded', false);

	const mmtShell = new MMTShell(context.extensionUri, () => client);
	context.subscriptions.push(vscode.window.registerWebviewViewProvider(MMTShell.viewId, mmtShell));

	context.subscriptions.push(vscode.commands.registerTextEditorCommand("mmt.typecheck", editor => {
		client?.typecheck(editor.document);
	}));
	context.subscriptions.push(vscode.commands.registerTextEditorCommand("mmt.buildmmtomdoc", editor => {
		const doc = editor.document;
		doc.save().then(hasSaved => {
			if (!hasSaved) {
				vscode.window.showErrorMessage(
					`Could not save ${doc.fileName} before building to mmt-omdoc. Build results may be outdated.`
				);
			}
			client?.buildMMTOmdoc(doc);
		});
	}));

	// invoked from explorer context menu
	context.subscriptions.push(vscode.commands.registerCommand("mmt.typecheckFile", (uri: vscode.Uri) => {
		vscode.workspace.openTextDocument(uri).then(doc => {
			// todo: need to wait awkwardly for LSP server to receive didOpen event
			//       and register the corresponding document in its internal state
			setTimeout(() => client?.typecheck(doc), 750);
		});
	}));
	// invoked from explorer context menu
	context.subscriptions.push(vscode.commands.registerCommand("mmt.buildmmtomdocFile", (uri: vscode.Uri) => {
		vscode.workspace.openTextDocument(uri).then(doc => {
			// todo: need to wait awkwardly for LSP server to receive didOpen event
			//       and register the corresponding document in its internal state
			setTimeout(() => client?.buildMMTOmdoc(doc), 750);
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand("mmt.runmsl", (uri: vscode.Uri) => {
		client?.runMSLFile(uri);
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
		loadMMTClient(context, mmtShell);
	}));

	const checkTimeout = vscode.workspace.getConfiguration("mmt").get<number>("ui.checkTimeout") || -1;
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

	const saveBuildTimeout = vscode.workspace.getConfiguration("mmt").get<number>("ui.saveBuildTimeout") || -1;
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

	outputChannel.show();
	loadMMTClient(context, mmtShell);
}

function loadMMTClient(context: vscode.ExtensionContext, shell: MMTShell): void {
	if (client !== null) {
		vscode.window.showErrorMessage("Internal error of MMT extension: " +
			"we were instructed to reload the client despite client !== null yet.");
		return;
	}

	vscode.window.withProgress({
		title: "Loading MMT",
		location: vscode.ProgressLocation.Window,
		cancellable: false
	}, async (progress, _) => {
		progress.report({message: "Starting MMT Server"});

		if (!vscode.workspace.workspaceFolders) {
			progress.report({message: "MMT could not load"});
			vscode.window.showErrorMessage("MMT will not start because you've opened a single file and not a project directory.");
			return Promise.reject(null);
		}

		progress.report({message: "Starting MMT Server"});

		const projectHome = vscode.workspace.workspaceFolders[0].uri.fsPath;
		return launchMMT(context, projectHome).then(newClient => {
			newClient.onDidChangeState(event => {
				switch (event.newState) {
					case language.State.Running:
						vscode.commands.executeCommand('setContext', 'mmt.loaded', true);
						progress.report({message: "MMT Server started"});

						newClient.onRequest("shellLog", (msg: MMTLogEntry) => {
							shell.log(msg);
						});
						break;
	
					case language.State.Stopped:
						vscode.commands.executeCommand('setContext', 'mmt.loaded', false);
						break;
				}
				client = newClient;
			});
			context.subscriptions.push(newClient);

			// start client with timeout in mind
			return new Promise<void>((resolve, reject) => {
				let startedAlready = false;
				setTimeout(() => {
					if (!startedAlready) {
						reject("Starting of MMT Server timed out");
					}
				}, 8000);

				newClient.start().then(() => {
					startedAlready = true;
					resolve();
				}).catch(reject);
			});
		}).catch(error => {
			vscode.window.showErrorMessage("Error while starting MMT Server: " + error);
			console.error(error);

			vscode.window.showInformationMessage("Try reloading the MMT Server", "reload").then(choice => {
				if (choice === "reload") {
					vscode.commands.executeCommand("mmt.reload");
				}
			});
		});
	});
}

export function deactivate() {
}
