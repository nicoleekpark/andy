# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/), versions follow [Semantic Versioning](https://semver.org/).

Update this as part of `eas-release-checklist`, before each submission — skim merged PR titles since the last entry (commits already follow conventional-commits style, so this is a fast pass, not a new discipline).

## [Unreleased]
### Added
- **Write to → Reach out**: pick notes, add your own words, generate a draft (#199)
- Review offers to update a kept person's name when you say it differently (#192)
- A full name answers to its first name — "Barbara" finds "Barbara Apple" (#191)
- Search by words inside notes, not just names (#188)

### Changed
- V1 scope cut (day 4): the home widget, Siri Shortcut, contacts sync, pet-metrics UI, tag filters, and vCard export moved to V1.1; the RAG chatbot was promoted into Must Have and folded into the recall screen as one "Ask Andy" surface. Measured rate (1 plan-day ≈ 2.5 working days) forced a scope cut rather than a second schedule extension. See `PROJECT_SCOPE.md` → "The V1 scope cut".

### Fixed
- Nudge title now asks "Anything to remember about Priya?" (#193)
- Discard cancel no longer loses focus (#187)
- Ask keyboard stays up after results (#186)
