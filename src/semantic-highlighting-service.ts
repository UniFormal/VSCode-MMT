/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// import { inject, injectable } from 'inversify';
import URI from './util/highlighting/uri'; // '@theia/core/lib/common/uri';
// import { ILogger } from '@theia/core/lib/common/logger';
// import { EditorManager } from './util/highlighting/editor-manager'; // '@theia/editor/lib/browser/editor-manager';
import { Disposable, DisposableCollection } from './util/highlighting/disposable';
// import { EditorDecoration, EditorDecorationOptions } from '@theia/editor/lib/browser/decorations';
import { SemanticHighlightingService, SemanticHighlightingRange, Range } from './util/highlighting/semantic-highlighting-service';
import { SemanticHighlightingParams } from './util/highlighting/semantic-highlighting/semantic-highlighting-protocol';
// import { MonacoEditor } from './monaco-editor';
import * as vscode from 'vscode'; 
import { MMTLanguageClient } from './extension';
import { listenerCount } from 'cluster';

export class MMTSemanticHighlightingService extends SemanticHighlightingService {

    client : MMTLanguageClient;

    constructor(cl:MMTLanguageClient) {
        super();
        this.client = cl;
    }
    
    static _list = ['mmt.keyword'
        ,'mmt.comment'
        ,"mmt.scomment"
        ,"mmt.name"
        ,"mmt.md"
        ,"mmt.dd"
        ,"mmt.od"
        ,"mmt.terminit"
        ,"mmt.termchecked"
        ,"mmt.termerrored"
    ];

    static _decorators = MMTSemanticHighlightingService._list.map<vscode.DecorationRenderOptions>(s => 
        ({ 
            key:s,
            color: new vscode.ThemeColor(s) 
        })); // [{color:new vscode.ThemeColor("keyword.other")}];
    static decorators : vscode.TextEditorDecorationType[] = MMTSemanticHighlightingService._decorators.map(s =>
        vscode.window.createTextEditorDecorationType(s));

    private getPos(r:SemanticHighlightingRange):vscode.Range {
        let startPos = new vscode.Position(r.start.line,r.start.character);
        let endPos = new vscode.Position(r.end.line,r.end.character);
        return new vscode.Range(startPos,endPos);
    }

    async decorate(languageId: string, uri: URI, ranges: SemanticHighlightingRange[]): Promise<void> {
        this.client.outputChannel.appendLine("Semantic Highlighting");
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || activeEditor.document.uri.path !== uri.path.toString()) { return; }

        MMTSemanticHighlightingService.decorators.forEach(d => {
            let l : SemanticHighlightingRange[] = ranges.filter(r => (r.scope?r.scope:0) === MMTSemanticHighlightingService.decorators.indexOf(d) );
            let rs = l.map(this.getPos);
            activeEditor.setDecorations(d,rs);
        });
    }

    dispose(): void {
        // NOOP
    }
}

// @injectable()
/*
export class MMTSemanticHighlightingService extends SemanticHighlightingService {

    // @inject(ILogger)
    // protected readonly logger: ILogger;

    // @inject(EditorManager)
    // protected readonly editorManager: EditorManager;

    protected readonly decorations = new Map<string, Set<string>>();
    protected readonly toDisposeOnEditorClose = new Map<string, Disposable>();

    async decorate(languageId: string, uri: URI, ranges: SemanticHighlightingRange[]): Promise<void> {
        const editor = await this.editor(uri);
        if (!editor) {
            return;
        }

        const key = uri.toString();
        if (!this.toDisposeOnEditorClose.has(key)) {
            this.toDisposeOnEditorClose.set(key, new DisposableCollection(
                editor.onDispose(() => this.deleteDecorations(key, editor))
            ));
        }

        const newDecorations = ranges.map(range => this.toDecoration(languageId, range));
        const oldDecorations = this.oldDecorations(key, editor, ranges);
        const newState = editor.deltaDecorations({
            newDecorations,
            oldDecorations
        });

        const decorationIds = this.decorationIds(key);
        newState.forEach(id => decorationIds.add(id));
        this.decorations.set(key, decorationIds);
    }

    dispose(): void {
        Array.from(this.toDisposeOnEditorClose.values()).forEach(disposable => disposable.dispose());
    }

    protected decorationIds(uri: string | URI): Set<string> {
        return this.decorations.get(typeof uri === 'string' ? uri : uri.toString()) || new Set();
    }

    /*
    protected async editor(uri: string | URI): Promise<MonacoEditor | undefined> {
        const editorWidget = await this.editorManager.getByUri(typeof uri === 'string' ? new URI(uri) : uri);
        if (!!editorWidget && editorWidget.editor instanceof MonacoEditor) {
            return editorWidget.editor;
        }
        return undefined;
    }

    protected async model(uri: string | URI): Promise<monaco.editor.ITextModel | undefined> {
        const editor = await this.editor(uri);
        if (editor) {
            return editor.getControl().getModel();
        }
        return undefined;
    }
    */

    /**
     * Returns all the semantic highlighting decoration IDs that are affected by any of the range arguments.
     */
    /*
    protected oldDecorations(uri: string, editor: MonacoEditor, ranges: SemanticHighlightingRange[]): string[] {
        const ids = this.decorationIds(uri);
        const affectedLines = Array.from(new Set(ranges.map(r => [r.start.line, r.end.line]).reduce((prev, curr) => prev.concat(curr), [])));
        return affectedLines
            .map(line => editor.getLinesDecorations(line, line))
            .reduce((prev, curr) => prev.concat(curr), [])
            .map(decoration => decoration.id)
            .filter(id => ids.has(id));
    }

    protected deleteDecorations(uri: string, editor: MonacoEditor): void {
        const ids = this.decorations.get(uri);
        if (ids) {
            const oldDecorations = Array.from(ids);
            editor.deltaDecorations({
                newDecorations: [],
                oldDecorations
            });
            this.decorations.delete(uri);
        }
        const disposable = this.toDisposeOnEditorClose.get(uri);
        if (disposable) {
            disposable.dispose();
        }
        this.toDisposeOnEditorClose.delete(uri);
    }

    protected toDecoration(languageId: string, range: SemanticHighlightingRange): EditorDecoration {
        const { start, end } = range;
        const scopes = range.scope !== undefined ? this.scopesFor(languageId, range.scope) : [];
        const options = this.toOptions(scopes);
        return {
            range: Range.create(start, end),
            options
        };
    }

    protected toOptions(scopes: string[]): EditorDecorationOptions {
        // TODO: why for-of? How to pick the right scope? Is it fine to get the first element (with the narrowest scope)?
        for (const scope of scopes) {
            const metadata = this.tokenTheme().match(undefined, scope);
            const inlineClassName = monaco.modes.TokenMetadata.getClassNameFromMetadata(metadata);
            return {
                inlineClassName
            };
        }
        return {};
    }

    protected tokenTheme(): monaco.services.TokenTheme {
        return monaco.services.StaticServices.standaloneThemeService.get().getTheme().tokenTheme;
    }
    */
/*
}*/
