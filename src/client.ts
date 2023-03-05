import * as language from 'vscode-languageclient/node';
import * as net from "net";
import * as path from "path";
import * as vscode from 'vscode';
import { outputChannel } from './output-channel';

import {getJavaHome} from "./util/getJavaHome";
import {getJavaOptions} from "./util/getJavaOptions";

const clientOptions: language.LanguageClientOptions = {
	documentSelector: [{ scheme: "file", language: "mmt" }],
	synchronize: {
		configurationSection: "mmt"
	},
	revealOutputChannelOn: language.RevealOutputChannelOn.Info,
	outputChannel: outputChannel
};

export interface BuildMessage {
	uri: string;
}

export class MMTLanguageClient extends language.LanguageClient {
	public languageId = "mmt";

	constructor(serverOptions: language.ServerOptions, clientOptions: language.LanguageClientOptions) {
		super("mmt", "MMT", serverOptions, clientOptions);
	}

	public typecheck(doc: vscode.TextDocument) {
		const uri = doc.fileName.replace("c:", "C:"); // TODO hack
		this.sendNotification(
			new language.ProtocolNotificationType<BuildMessage, void>("mmt/typecheck"),
			{uri}
		);
	}
	
	public buildMMTOmdoc(doc: vscode.TextDocument) {
		const uri = doc.fileName.replace("c:", "C:"); // TODO hack
		this.sendNotification(
			new language.ProtocolNotificationType<BuildMessage, void>("mmt/build/mmt-omdoc"),
			{uri}
		);
	}
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
		const openSettingsAction = "Open settings";
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

export async function launchMMT(context: vscode.ExtensionContext, projectHome: string): Promise<MMTLanguageClient> {
	const serverOptions = await createServerOptions(projectHome);

	const languageClient = new MMTLanguageClient(serverOptions, clientOptions);

	languageClient.start();

	outputChannel.appendLine("Done starting client.");

	return languageClient;
}

