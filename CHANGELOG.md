# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.4] - 2026-02-17

### Added
- Added `Allowlist Mode` in settings. When enabled, sites are disabled by default and must be explicitly enabled.
- Added support for Free Dictionary API pronunciation audio with browser speech fallback.
- Added host permission for `https://api.dictionaryapi.dev/*`.
- Added rounded-rectangle icon refresh with transparent background and border styling.

### Changed
- Updated README feature documentation for allowlist mode, pronunciation source, and settings behavior.

## [1.3.3] - 2026-02-11

### Added
- Added highlighted-word action bubble for quick actions.
- Added actions in the word bubble: recolor word, edit translation, delete word, and pronunciation.

### Fixed
- Fixed speech flow robustness when extension context is invalidated.

### Changed
- Updated icon assets for improved visual consistency.

## [1.3.2] - 2026-02-09

### Added
- Added popup editing workflow for saved words with improved color selection UX.
- Added cleaner palette-based color editing behavior in popup cards.

### Changed
- Refactored popup and related code paths for readability and maintainability.

## [1.2.1] - 2026-02-03

### Added
- Added stronger site control UX in popup (clear active/inactive status and visual indicators).

### Changed
- Optimized highlight processing with regex caching and debounced incremental DOM updates.
- Improved matching stability and manual translation fallback behavior.

## [1.2.0] - 2026-02-01

### Added
- Added per-site enable/disable control from popup.

### Changed
- Updated extension description and build packaging structure.

