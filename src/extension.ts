// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as language from 'vscode-languageclient';
import * as rpc from 'vscode-jsonrpc';
import {getJavaHome} from "./util/getJavaHome";
import * as path from "path";
import {getJavaOptions} from "./util/getJavaOptions";
import { spawn } from "promisify-child-process";
import * as net from 'net';
import { SemanticHighlightingParams } from './util/highlighting/semantic-highlighting/semantic-highlighting-protocol';
import { setFlagsFromString } from 'v8';
import { SemanticHighlightFeature } from './util/highlighting/semantic-highlighting/semantic-highlighting-feature';
import { MMTSemanticHighlightingService } from './semantic-highlighting-service';

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

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// launchLocal(context);
	launchRemote(context);
}

function handleClient(client: MMTLanguageClient, context: vscode.ExtensionContext) {
	const features = new MMTFeatures(client);
	client.registerFeature(features);

	function registerCommand(command: string, callback: (...args: any[]) => any) {
		context.subscriptions.push(vscode.commands.registerCommand(command, callback));
	}

	const service = new MMTSemanticHighlightingService(client);

	client.registerFeature(MMTSemanticHighlightingService.createNewFeature(service,client));

	context.subscriptions.push(client.start());

	outputChannel.appendLine("Done.");


	// client.onRequest("textDocument/semanticHighlighting",outputChannel.appendLine);
	//client.onNotification("textDocument/semanticHighlighting",outputChannel.appendLine);
}

function launchRemote(context: vscode.ExtensionContext) {
	// The server is a started as a separate app and listens on port 5007
    let connectionInfo = {
        port: 5007
    };
    let serverOptions = () => {
        // Connect to language server via socket
        let socket = net.connect(connectionInfo);
        let result: language.StreamInfo = {
            writer: socket,
            reader: socket
        };
        return Promise.resolve(result);
    };

	// Create the language client and start the client.	
	const client = new MMTLanguageClient(
		serverOptions,
		clientOptions
	);
	handleClient(client,context);
}


function launchLocal(context: vscode.ExtensionContext) {
	getJavaHome().catch(err => javaErr())
	.then(javaHome => {
		console.log("javaHome: " + javaHome);
		if (!javaHome) {
			javaErr();
			return;
		}
		launchMMT(context, javaHome);
	});
  vscode.commands.executeCommand("setContext", "mmt:enabled", true);
}

function launchMMT(context: vscode.ExtensionContext, javaHome: string) {
	if (!vscode.workspace.workspaceFolders) {
		const message =
			"MMT will not start because you've opened a single file and not a project directory.";
		outputChannel.appendLine(message);
		vscode.window.showErrorMessage(message, openSettingsAction).then(choice => {
		  if (choice === openSettingsAction) {
			vscode.commands.executeCommand("workbench.action.openSettings");
		  }
		});
	  return;
	}

	const config = vscode.workspace.getConfiguration("mmt");
  
	outputChannel.appendLine(`Java home: ${javaHome}`);
	const javaPath = path.join(javaHome, "bin", "java");
	const mmtJarPathO = config.get<string>("jarpath");
	if(!mmtJarPathO) { 
		const message =
		"Path to MMT jar not set";
		outputChannel.appendLine(message);
		vscode.window.showErrorMessage(message, openSettingsAction).then(choice => {
	  		if (choice === openSettingsAction) {
				vscode.commands.executeCommand("workbench.action.openSettings");
	  		}
		});
  		return;
	}
	const mmtJarPath = mmtJarPathO; 

	const serverProperties: string[] = config
	  .get<string>("serverProperties")!
	  .split(" ")
	  .filter(e => e.length > 0);
	  
  
	const javaOptions = getJavaOptions(outputChannel);

	const baseProperties = [
		"-Xmx8192m",
		"-classpath",
		mmtJarPath,
		"info.kwarc.mmt.lsp.Local"
	  ];
	const launchArgs = baseProperties
		.concat(javaOptions);

	outputChannel.appendLine("Initializing MMT LSP Server");

	const serverOptions: language.ServerOptions = {
		run: { command: javaPath, args: launchArgs },
		debug: { command: javaPath, args: launchArgs }
	};

	const client = new MMTLanguageClient(
		serverOptions,
		clientOptions
	);
	handleClient(client,context);
}

function javaErr() {
	const message =
	"Unable to find Java home. To fix this problem, update the 'Java Home' setting to point to a Java 8 home directory";
  	outputChannel.appendLine(message);
  	vscode.window.showErrorMessage(message, openSettingsAction).then(choice => {
		if (choice === openSettingsAction) {
	  	vscode.commands.executeCommand("workbench.action.openSettings");
		}
  	});
}

export class MMTLanguageClient extends language.LanguageClient {
	public languageId = "mmt";

	constructor(serverOptions:language.ServerOptions,clientOptions:language.LanguageClientOptions) {
		super("mmt","MMT",serverOptions,clientOptions);
	}
}

// this method is called when your extension is deactivated
export function deactivate() {}

export interface TreeViewProvider {}

// export interface 

export class MMTFeatures implements language.StaticFeature {

	client : language.LanguageClient;

	constructor(cl:language.LanguageClient) {
		this.client = cl;
	}

	fillInitializeParams(params: language.InitializeParams): void {
	  if (!params.capabilities.experimental) {
		params.capabilities.experimental = {};
	  }
	  params.capabilities.experimental.treeViewProvider = true;
	}
	fillClientCapabilities(): void {}
	initialize(capabilities: language.ServerCapabilities): void {
		outputChannel.append("");
	}
}