Changelog
=========

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.3.1] - 2023-03-22

- Fixed bad example in README

## [2.3.0] - 2022-09-03

- Add support for GEO substructures

## [2.2.1] - 2022-05-17

- esi:except in esi:try should be optional

## [2.2.0] - 2022-05-17

- check for esi:when and otherwise in esi:choose
- add validation for esi:try
- fix example typo and new eslint rules

## [2.1.2] - 2022-03-03

### Fixed
- Throw error if esi:choose has other direct children than esi:when and esi:otherwise

## [2.1.1] - 2021-12-20

### Fixed
- Less strict got peer version

## [2.1.0] - 2021-12-20

### Added
- Support `$string_split`
- Support named `item` variable in foreach

## [2.0.2] - 2021-12-20

### Fixed
- Tweak performance by using for loop instead of forEach

## [2.0.1] - 2021-12-17

### Fixed
- Removed fallthrough behaviour of overlapping whens

## [2.0.0] - 2021-12-09

Change the public api and refactor to classes

### Changed
- Public API
- Minimum node version is now 14 since URL behaves' in earlier versions

### Removed
- Previous default export function is gone, replaced by `parse`

### Fixed
- More descriptive expression error messages

## [1.2.7] - 2021-08-25
### Changed
- Use bonniernews scoped packaged fork of atlas-html-stream dependency

## [1.2.6] - 2021-02-16
### Changed
- Change protocol of atlas-html-stream dependency

## [1.2.5] - 2021-01-26
### Changed
- Multiple `$set_header` calls with "Set-Cookie" results in multiple headers

## [1.2.4] - 2021-01-07
### Changed
- Don't crash when comparing undefined identifier

### Added
- Added changelog (better late than never)

## [<=1.2.3]
?
