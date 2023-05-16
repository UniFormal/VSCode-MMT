import * as findJavaHome from 'find-java-home';
import * as language from 'vscode-languageclient/node';
import * as net from "net";
import * as path from "path";
import * as vscode from 'vscode';
import { outputChannel } from './output-channel';

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

export async function launchMMT(context: vscode.ExtensionContext, projectHome: string): Promise<MMTLanguageClient> {
	const serverOptions = await ServerOptions.loadFromConfiguration(context, projectHome);
	const languageClient = new MMTLanguageClient(serverOptions, clientOptions);

	return languageClient;
}

class ServerOptions {
	public static loadFromConfiguration(context: vscode.ExtensionContext, projectHome: string): Promise<language.ServerOptions> {
		switch (vscode.workspace.getConfiguration("mmt").get<string>("invocation.mode")) {
			case "jar":
				return ServerOptions.forJAR(context, projectHome);
			case "socket":
				return ServerOptions.forSocket();
			/*case "sbt": experimental
				return ServerOptions.forSBT(projectHome);*/
	
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

	public static async forJAR(context: vscode.ExtensionContext, projectHome: string): Promise<language.ServerOptions> {
		const config = vscode.workspace.getConfiguration("mmt");
	
		const javaHome: string = await (async () => {
			const userJavaHome = vscode.workspace.getConfiguration("mmt").get<string>("invocation.javaHome");
  			if (typeof userJavaHome === "undefined" || userJavaHome === "") {
    			return new Promise((resolve, reject) =>
					findJavaHome({allowJre: true}, (err, javaHome) => {
						if (err) {
							reject(err);
						} else {
							resolve(javaHome);
						}
					})
				);
			} else {
				return userJavaHome;
			}
		})();
		const javaPath = path.join(javaHome, "bin", "java");
		const mmtJarPath = (() => {
			const optionMmtJar = config.get<string>("invocation.mmtJar");
			if (optionMmtJar === "") {
				return context.asAbsolutePath("lib/mmt.jar");
			} else {
				return optionMmtJar;
			}
		})();

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
			.get<string>("invocation.javaFlags")!
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

	/*
	 * @todo experimental!
	 * @param projectHome must not contain double quotes
	 *
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
	}*/
}
