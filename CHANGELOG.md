# Change Log

All notable changes to the "mmt" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## Unreleased

## [0.3.1] -- 2023-07-05

### Fixed

- Archives are now correctly loaded on case-sensitive file and operating systems (incl. most \*nix systems)

## [0.3.0] -- 2023-07-05

### Added

- Integrated a preliminary MMT shell
- *Go To Definition* functionality is now more fine-grained and only applicable on notations of a term (and not ambigiously on notations of its subterms)

### Fixed

- Archives are now loaded at all on Windows (if they were on drives other than `C:`) and \*nix systems [retrospective comment: this only fixe it for Windows and macOS, actually not for most Linux derivates, see version 0.3.1]

## [0.2.0] -- 2023-05-16

### Added

- remove burden of initial configuration for new users
  - a default `mmt.jar` is bundled with the extension
  - Java Home is automatically inferred from `java` on `PATH`
- preliminary *Go To Definition* functionality (ctrl+hover over constant references and notations)
- support of *Find All References*, i.e. usages,  functionality for MMT constants and modules (right-click on constant or module name and click *Find All References*)
- typecheck & build actions accessible from explorer's context menu
- icons for `.mmt` files

## [0.1.2] -- 2023-04-26

### Fixed

- Improve README documentation

## [0.1.0] - 2023-04-25

### Added

- Ability to connect to MMT via an `mmt.jar` (JAR runmode)

### Fixed

- Improve README documentation

## [0.0.1]

### Added

- syntax highlighting
- typechecking
- building
