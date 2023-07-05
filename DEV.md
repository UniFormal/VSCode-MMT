# Extension Development

## Packaging & Publishing

[Install vsce](https://code.visualstudio.com/api/working-with-extensions/publishing-extension): `npm install --global @vscode/vsce`

1. copy an `mmt.jar` nightly to `lib/mmt.jar` and edit `lib/mmt.jar.version.txt` accordingly
2. `vsce package`
3. `vsce publish`
