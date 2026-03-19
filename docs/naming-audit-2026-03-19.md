# Naming Audit Baseline (2026-03-19)

## Scope Audited
- Frontend core: `index`, `login`, `components/navbar`, `css`, `js` entrypoints

## Grouping
- `file`
  - Improved: `css/app.css`, `js/index-page.js`
  - Legacy compatibility: `css/style.css`, `js/script.js`
- `css-class`
  - Improved: `.content-narrow` (alias kept for `.pengecilan`)
- `dom-id/data-*`
  - Improved in core flow: `navbar-mount`, `filter-modal`, `location-text`
  - Improved in index form/feed flow: `report-list`, `sort-filter`, `time-filter`, `agency-filter-user`, `reset-filter-btn`, `report-modal`, `photo-error`, `photo-preview-wrap`, `photo-preview-grid`, `photo-preview-count`, `title-error`, `agency-guide-panel`, `use-location`, `submit-btn`, `app-toast`, `app-toast-body`, `image-inspect-modal`, `image-inspect-title`, `image-inspect-preview`, `report-grid`
  - Improved navbar hooks: `auth-action-btn`, `search-input`, `create-report-btn`, `nav-notif-modal`, etc.
- `js-identifier`
  - Kept as `camelCase` / `UPPER_SNAKE_CASE` in frontend code

## Remaining Legacy (intentional for incremental rollout)
- Several existing IDs on feature forms/pages are still camelCase and will be migrated per module in next passes.
