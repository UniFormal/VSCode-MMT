import * as vscode from 'vscode';
import * as language from 'vscode-languageclient/node';
import * as net from "net";

import {getJavaHome} from "./util/getJavaHome";
import {getJavaOptions} from "./util/getJavaOptions";
import * as path from "path";
import { LanguageClient } from 'vscode-languageclient/node';
import * as debounce from "debounce";
import { assert } from 'console';

const outputChannel = vscode.window.createOutputChannel("MMT");
const openSettingsAction = "Open settings";
const openSettingsCommand = "workbench.action.openSettings";

const clientOptions: language.LanguageClientOptions = {
	documentSelector: [{ scheme: "file", language: "mmt" }],
	synchronize: {
		configurationSection: "mmt"
	},
	revealOutputChannelOn: language.RevealOutputChannelOn.Info,
	outputChannel: outputChannel
};

interface BuildMessage {
	file:string
}

/**
 * invariant: if in extension context 'mmt.loaded' is true, then client is non-null.
 */
let client: MMTLanguageClient|null = null;

export function activate(context: vscode.ExtensionContext) {
	vscode.commands.executeCommand('setContext', 'mmt.loaded', false);
	context.subscriptions.push(vscode.commands.registerCommand("mmt.buildmmtomdoc", () => {
		const file = vscode.window.activeTextEditor?.document.fileName;
		if (file) {
			buildMMTOmdoc(file);
		} else {
			vscode.window.showInformationMessage("No currently opened file.");
		}
	}));

	const saveCheckTimeout = vscode.workspace.getConfiguration("mmt").get<number>("saveCheckTimeout") || -1;
	assert(saveCheckTimeout === -1 || saveCheckTimeout >= 0);

	if (saveCheckTimeout !== -1) {
		const debouncedSaveCheck = debounce((event: vscode.TextDocumentChangeEvent) => {
			event.document.save().then(hasSaved => {
				if (hasSaved && client !== null) { // important: recheck client's availability
					buildMMTOmdoc(event.document.fileName);
				}
			});
		}, saveCheckTimeout);

		context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId !== 'mmt' || client === null) {
				return;
			}

			debouncedSaveCheck(event);
		}));
	}

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

	loadMMTClient(context);
}

function buildMMTOmdoc(file: string) {
	file = file.replace("c:", "C:"); // TODO hack
	client?.sendNotification(
		new language.ProtocolNotificationType<BuildMessage, void>("mmt/build/mmt-omdoc"),
		{file}
	);
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
			client = newClient;
			context.subscriptions.push(client);

			vscode.commands.executeCommand('setContext', 'mmt.loaded', true);
			vscode.window.showInformationMessage("MMT client loaded.");
		})
		.catch(console.error.bind(console));
	} else {
		const message =
			"MMT will not start because you've opened a single file and not a project directory.";
		outputChannel.appendLine(message);
		vscode.window.showErrorMessage(message, openSettingsAction).then(choice => {
			if (choice === openSettingsAction) {
				vscode.commands.executeCommand("workbench.action.openSettings");
			}
		});
	}
}

export function deactivate() {
}

const lspMainClass = "info.kwarc.mmt.lsp.Local";
const lspPort = 5007;

function createServerOptionsForPort(): Promise<language.ServerOptions> {
    return Promise.resolve(() => {
        const socket = net.connect({port: lspPort});
        return Promise.resolve<language.StreamInfo>({
            writer: socket,
            reader: socket
        });
    });
}

/**
 * 
 * @param projectHome must not contain double quotes
 * @returns 
 */
function createServerOptionsForSBT(projectHome: string): Promise<language.ServerOptions> {
	const mmtrepo = vscode.workspace.getConfiguration("mmt").get<string>("mmtrepo");
	if (!mmtrepo) {
		return Promise.reject();
	}

	const executable: language.Executable = {
		command: "sbt",
		args: [`runMain ${lspMainClass} "${projectHome}"`],
		options: {
			cwd: path.join(mmtrepo, "src"),
			env: process.env,
			shell: true // needed to execute sbt.bat (since it's a bat file)
		}
	};

	console.log(executable);

	return Promise.resolve({
		run: executable,
		debug: executable
	});
}

async function createServerOptionsForJAR(projectHome: string): Promise<language.ServerOptions> {
	const config = vscode.workspace.getConfiguration("mmt");

	const javaHome = await getJavaHome();
	const javaPath = path.join(javaHome, "bin", "java");
	const mmtJarPath = config.get<string>("mmtjar");
	if(!mmtJarPath) { 
		vscode.window.showErrorMessage("Path to MMT jar not set", openSettingsAction)
		.then(choice => {
			if (choice === openSettingsAction) {
				vscode.commands.executeCommand("workbench.action.openSettings");
			}
		});
  		return Promise.reject();
	}

	const serverProperties: string[] = config
		.get<string>("serverProperties")!
		.split(" ")
		.filter(e => e.length > 0);

	const javaOptions = getJavaOptions(outputChannel);

	const baseProperties = [
		"-Xmx8192m",
		"-classpath",
		mmtJarPath,
		lspMainClass,
		projectHome
	];
	const launchArgs = baseProperties.concat(javaOptions);

	outputChannel.appendLine("Initializing MMT LSP Server");

	return Promise.resolve({
		run:   { command: javaPath, args: launchArgs },
		debug: { command: javaPath, args: launchArgs }
	});
}

function createServerOptions(projectHome: string): Promise<language.ServerOptions> {
	/*if (vscode.workspace.getConfiguration("mmt").get<boolean>("usesbt")) {
		return createServerOptionsForSBT(projectHome);
	} else {
		return createServerOptionsForJAR(projectHome);
	}*/
	return createServerOptionsForPort();
}

async function launchMMT(context: vscode.ExtensionContext, projectHome: string): Promise<MMTLanguageClient> {
	const serverOptions = await createServerOptions(projectHome);

	const languageClient = new MMTLanguageClient(serverOptions, clientOptions);

	languageClient.registerFeature(new BuildFeature(languageClient));
	languageClient.start();

	outputChannel.appendLine("Done starting client.");

	return languageClient;
}

export class MMTLanguageClient extends language.LanguageClient {
	public languageId = "mmt";

	constructor(serverOptions: language.ServerOptions, clientOptions: language.LanguageClientOptions) {
		super("mmt", "MMT", serverOptions, clientOptions);
	}
}

export class BuildFeature implements language.StaticFeature {
	client : language.LanguageClient;

	constructor(cl:language.LanguageClient) {
		this.client = cl;
	}
	fillClientCapabilities(capabilities: language.ClientCapabilities): void {}
	fillInitializeParams?: ((params: language.InitializeParams) => void) | undefined;
	// preInitialize?: ((capabilities: language.ServerCapabilities<any>, documentSelector: language.DocumentSelector | undefined) => void) | undefined;
	initialize(capabilities: language.ServerCapabilities): void {
		/*context.subscriptions.push(vscode.commands.registerCommand('mmt.buildmmtomdoc', () => {
			vscode.window.showInformationMessage('Hello World from mmt!');
		}));
		outputChannel.append("");*/
	}
	dispose() : void {}

	getState(): language.FeatureState {
		return {
			kind: 'document',
			id: 'mmt.buildmmtomdoc',
			registrations: true,
			matches: true
		};
	}
}