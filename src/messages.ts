export class MMTShellViewState {
	constructor(public readonly log: MMTLogEntry[]) {}
}
    
export interface MMTShellViewMessage {
    readonly kind: string;
}

export class MMTShellViewLogMessage {
    kind = "log";
    constructor(public readonly msg: MMTLogEntry) {}
}

export class MMTShellViewRestoreMessage implements MMTShellViewMessage {
    kind = "restore";
    constructor(public readonly state: MMTShellViewState) {}
}

export interface MMTServerBuildMessage {
	uri: string;
}

export interface MMTServerHandleLineMessage {
	line: string;
}

export interface MMTLogEntry {
	ind: number;
	caller: String;
	group: String;
	msgParts: String[];
}
