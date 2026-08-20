# Dashboard CSS Class Inventory (approved-design.html)

This inventory lists approved HTML/CSS classes from `prototype/approved-design.html` that apply to the Dashboard and maps each to the Angular component/file where its CSS should reside.

- `sfc-shell` → global layout; styles in `src/scss/layout/_layout.scss` or `src/styles.scss`
- `sfc-sidebar` → Sidebar structure; `src/app/shared/components/sidebar/sidebar.component.scss`
- `sfc-sidebar-backdrop` → Sidebar mobile backdrop; `sidebar.component.scss`
- `sfc-main` → Main content area; global layout or `dashboard-layout.component.scss`
- `sfc-topbar` → Topbar container; `src/app/shared/components/topbar/topbar.component.scss`
- `sfc-hamburger` / `sfc-hamburger` variants → Topbar hamburger; `topbar.component.scss`
- `sfc-page-pad` → Page content padding; global `src/scss/utilities/_helpers.scss` (or dashboard-home.component.scss for page-specific overrides)
- `sfc-grid-2` / `sfc-grid-3` / `sfc-grid-4` / `sfc-grid-5` → Responsive grids; `src/scss/utilities/_helpers.scss` (MUST match prototype values)
- `sfc-side-content` → 2-column side+main layout; `src/scss/utilities/_helpers.scss` or dashboard-specific SCSS
- `sfc-table-wrap` → Table wrapper overflow rules; global utilities `_helpers.scss`
- `sfc-hero-pane` / `auth-hero` → hero-style panels; global or feature SCSS where used
- `ticker-wrap`, `ticker-track`, `tick` → Ticker tape; `src/app/shared/components/ticker-tape/ticker-tape.component.scss`
- `nav-item` / `pub-nav` / `sfc-nav__link` → Navigation item styles; `sidebar.component.scss`
- `nav-item.active` / `.sfc-nav__link.active` hover states → Sidebar active/hover; `sidebar.component.scss`
- `pub-card-hover`, `pub-feat`, `pub-arrow` → Public page cards; global public styles (not to be changed)
- `cmdk-overlay`, `cmdk-box`, `cmdk-row` → Command palette; global or shared component SCSS
- `toast` → Toast UI; `src/styles.scss` (global)
- `num` → numeric monospace utility; global `_helpers.scss` or `variables`/typography files
- `fade-in` → animation helper; global `_helpers.scss`
- `field-err`, `invalid` → form validation helpers; global forms SCSS
- `.pub-nav`, `.pub-card-hover`, `.pub-arrow` → public marketing; keep in global public styles
- `sfc-hero-pane` → hero area; global

Notes:
- Media queries and breakpoints in `approved-design.html` must be preserved exactly; migrate to existing `_helpers.scss` or component SCSS where relevant.
- Any class used by the dashboard must have an authoritative CSS definition; if the class is global, put it in `src/scss/utilities/_helpers.scss` or `src/styles.scss`.
- Do NOT invent new visual classes for approved elements; preserve original class names when possible and copy the exact CSS declarations from `approved-design.html`.

Next actions:
1. Compare this inventory against Angular templates to find missing classes or missing rule coverage.
2. For each missing or incomplete class, copy the approved CSS declarations into the target SCSS file and preserve media queries and pseudo states.
3. Audit `var(--...)` uses and ensure every variable is defined in `src/styles/_dashboard-theme.scss`.

