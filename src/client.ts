import * as language from 'vscode-languageclient/node';
import * as net from "net";
import * as path from "path";
import * as vscode from 'vscode';
import { outputChannel } from './output-channel';

import {getJavaHome} from "./util/getJavaHome";
import {getJavaOptions} from "./util/getJavaOptions";
import { Server } from 'http';

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

export async function launchMMT(context: vscode.ExtensionContext, projectHome: string): Promise<MMTLanguageClient> {
	const serverOptions = await ServerOptions.loadFromConfiguration(projectHome);
	const languageClient = new MMTLanguageClient(serverOptions, clientOptions);

	languageClient.start();
	outputChannel.appendLine("Done starting client.");

	return languageClient;
}

class ServerOptions {
	public static loadFromConfiguration(projectHome: string): Promise<language.ServerOptions> {
		switch (vscode.workspace.getConfiguration("mmt").get<string>("runmode")) {
			case "jar":
				return ServerOptions.forJAR(projectHome);
			case "socket":
				return ServerOptions.forSocket();
			case "sbt":
				return ServerOptions.forSBT(projectHome);
	
			default:
				return Promise.reject("Invalid configuration for mmt.runmode. See settings of mmt extension.");
		}
	}

	private static mainJavaClass = "info.kwarc.mmt.lsp.mmt.Main";
	private static socketPort = 5007;

	public static async forSocket(): Promise<language.ServerOptions> {
		return Promise.resolve(() => {
			const socket = net.connect({port: ServerOptions.socketPort});
			return Promise.resolve<language.StreamInfo>({
				writer: socket,
				reader: socket
			});
		});
	}

	public static async forJAR(projectHome: string): Promise<language.ServerOptions> {
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
		const launchArgs: string[] = [
			"-Xmx8192m",
			"-classpath",
			mmtJarPath,
			...javaOptions,
			ServerOptions.mainJavaClass,
			ServerOptions.socketPort.toString(),
			projectHome // todo: necessary?
		];

		outputChannel.appendLine("Initializing MMT LSP Server");
		// todo: the debug message below naively concatenates arguments via space, might differ from how the OS
		// is actually instructed to invoke the command because in launchArgs the arguments are provided separately
		outputChannel.appendLine(`MMT will be run via JAR: \`${javaPath} ${launchArgs.join(" ")}\``);
	
		return Promise.resolve({
			run:   { command: javaPath, args: launchArgs },
			debug: { command: javaPath, args: launchArgs }
		});
	}

	/**
	 * @todo experimental!
	 * @param projectHome must not contain double quotes
	 */
	public static async forSBT(projectHome: string): Promise<language.ServerOptions> {
		const mmtrepo = vscode.workspace.getConfiguration("mmt").get<string>("mmtrepo");
		if (!mmtrepo) {
			return Promise.reject();
		}
	
		const executable: language.Executable = {
			command: "sbt",
			args: [`runMain ${ServerOptions.mainJavaClass} "${projectHome}"`],
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
}
