# <img src="./img/logo_better_128x128.png" width="30em" /> MMT Extension for Visual Studio Code

## Features

Syntax highlighting, code completion, typechecking, building, lenses.

<!-- screenshot or animation -->

## Installation

1. Get ahold of an `mmt.jar`, most likely by downloading one of the pre-built releases.
2. Install Visual Studio Code by following their instructions
3. Install this MMT Extension for Visual Studio Code:
   1. Download the pre-built `*.vsix` extension file
   2. Open Visual Studio Code and press Ctrl+Shift+P (alternatively: `View -> Command Pallette...`)
   3. In the Command Pallette type `VSIX` and select `>Extensions: Install from VSIX...`.
   4. Select the `*.vsix` extension file you downloaded in step 3.1.
4. Configure the MMT Extension by pressing Ctrl+Shift+P and searching for `Settings` and selecting `Preferences: Open Settings (UI)`.
5. In the settings, search for `mmt`.
6. Select `jar` as the run mode and set the `*.jar` path to point to the file you downloaded in step 1.

## Usage

1. Create a directory for your MMT archives (e.g., called `archives`).
2. Clone MMT archives into that directory (e.g., by `git clone https://gl.mathhub.info/MMT/urtheories.git urtheories`).
3. Open your `archives` directory in Visual Studio Code

   On Windows, you can do this by navigating to your `archives` directory using WIndows Explorer, right-clicking in an empty space there, and selecting `Open with Code`.
   Alternatively and for other operating systems, open Visual Studio Code and select `File -> Open Folder...`.
4. In the Visual Studio Code window you can now open arbitrary `*.mmt` files.
5. When you have an `*.mmt` file opened, you can press Ctrl+Shift+P to open the command pallette and seek `typecheck` and `build`.

In case of errors or bugs, a helpful command is `Reload MMT`.

## Extension Settings
<!--

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.
-->

## Known Issues

Currently no code completion or lenses.

## Release Notes

### 0.0.1

Added syntax highlighting, typechecking, and building.

