# Naming Conventions (Frontend)

## Default Rules
- Files (`.html`, `.css`, `.js`): `kebab-case`
- CSS classes: `kebab-case`
- DOM IDs and `data-*`: `kebab-case`
- JS variable and function: `camelCase`
- JS constant: `UPPER_SNAKE_CASE`

## Do
- Use descriptive names: `location-text`, `filter-modal`, `create-report-btn`
- Keep domain terms in Indonesian if needed, but format stays consistent
- Prefer semantic file names: `app.css`, `index-page.js`

## Don't
- Mix style in same scope (`locText`, `location-text`, `LocationText`)
- Use ambiguous names like `script.js` for new page entrypoints
- Introduce new camelCase IDs/classes in markup

## Transition Policy
- Legacy names may stay temporarily as compatibility aliases
- New code must follow the rules above
