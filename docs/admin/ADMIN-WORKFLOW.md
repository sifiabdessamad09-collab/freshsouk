# Admin workflow improvements

This change builds on the existing private Admin V2. It does not change the public checkout, delivery rates, shipping zones or existing order totals.

## Result

- Orders: status shortcuts with all-date counts, creation-date shortcut for today, reset, collapsible advanced filters and shorter phone cards with the details action at the top.
- Order detail: keyboard-operable Commande / Livraison / Coûts / Historique tabs. The status form stays at the bottom of the dialog. Cost inputs remain associated with the versioned operations form even when shown in another tab.
- Dashboard: actionable outstanding-order cards, smaller metrics and an explicit inventory coverage warning. Zero stock alerts no longer suggests that untracked products have sufficient stock.
- Delivery list: exact neighborhood, courier and slot filters; grouping by neighborhood, courier or slot; previously entered couriers appear as suggestions. The neighborhood can be displayed from the prefix of an address containing ` — `; this never rewrites an address or guesses a neighborhood from free text.
- Finance and reports: choose creation date (existing default) or delivery date. Delivery date uses the order's terminal delivered-status `updated_at`, which operational-cost edits do not modify. The same date basis applies to product/category/zone totals and CSV exports. Expenses retain their actual expense date.
- Collections: manual cumulative collected/remitted amounts on delivered orders only, with optimistic versions and audit events. Remitted cannot exceed collected; collected cannot exceed the order total. These are bookkeeping declarations, not payment operations. Unknown declarations are counted separately from explicitly recorded zero amounts.
- Notifications: one stable notice per order, retaining previously marked reads. Background Web Push support is opt-in and disabled until separately configured.
- Presentation: FR / العربية / bilingual preference, larger secondary text, RTL layout for Arabic and existing reduced-motion behavior. Stored product/customer names and historical records are not machine-translated; French text without a dictionary entry remains readable as fallback.

## Migration and rollout

1. Retain the existing deployed Worker version and a recoverable snapshot of its actual D1 database. Identify the active private Worker and its database binding; do not use the placeholder ID in the repository's template.
2. Apply only `0005_admin_workflow.sql` after migrations 0001–0004. It adds `order_collections`, `push_subscriptions`, an index and collection audit triggers. It does not backfill or modify orders, stock or existing settings. Never replay 0004 against an already migrated database.
3. Verify the migration ledger and foreign keys, then deploy the matching backend and private assets together. The new analytics queries require 0005, so publishing new assets against an unmigrated backend is unsupported.
4. Review desktop, 390px and landscape layouts, all four dialog tabs, keyboard focus, FR/AR, dark/light and saved cost/collection values on a synthetic order. The local preview uses only fictional data. Do not confirm or cancel an actual customer order as a test.
5. Roll back the Worker/assets to the retained version if needed. The additive tables can remain; do not drop financial declarations during a rollback.

No remote migration or deployment is performed by these scripts or by CI. Existing rates (20 DH / free from 200 DH) and zone activation remain the owner's settings.

## Background notifications

The implementation uses empty Web Push messages with VAPID authentication (RFC 8030 / RFC 8292). No name, address, phone, total or order identifier is sent to a push provider or displayed on a device lock screen. The notification opens `/admin/#orders`, where Cloudflare Access still applies. The service worker has no fetch handler or caches.

On the **private** Worker only, configure a matching P-256 VAPID key pair:

- `PUSH_PUBLIC_KEY`: base64url uncompressed public key, available to the subscription UI.
- `PUSH_PRIVATE_JWK`: private JWK in Cloudflare's secret storage; never commit it or put it in a public Worker.
- `PUSH_SUBJECT`: monitored `mailto:` contact for the sender.
- `PUSH_ENABLED=true`, then a minute cron trigger on the private Worker.

The repository defaults are `PUSH_ENABLED=false` and an empty cron list. There is no credential generation, permission prompt, subscription or notification send on page load. Each device must explicitly click **Activer sur cet appareil** and grant the browser's permission. Devices can unsubscribe using the adjacent control.

The subscription endpoint requires the same owner JWT and CSRF protections as other private mutations. It permits only known HTTPS browser push-provider hosts, forbids redirects and IP/custom endpoint URLs, limits registrations to ten per owner, and stores endpoints only in the private database. The scheduled handler sends at most one generic notice for activity after registration, advances its cursor after a 201 response and removes subscriptions returned as expired (404/410). Transient failures retry at the next tick; provider delivery is not guaranteed or exactly-once. Revoked owners are excluded by the current `ADMIN_EMAILS` allowlist.

End-to-end device delivery needs verification after server configuration. Do not label push as active until that check succeeds. Browser/OS support and permissions may prevent activation.

## Validation

From `admin/`, using Node 24:

```sh
npm ci
npm run build
npm run check
npm test
node scripts/check-assets.mjs
node scripts/check-d1-migration.mjs
npx wrangler deploy --dry-run --outdir .dry-run
npx wrangler deploy --config wrangler.public.toml --dry-run --outdir .dry-run-public
```

Automated tests use real SQLite, signed owner tokens and DOM-based UI interaction tests. They cover date-boundary reporting, collections/versions, private-data boundaries, delivery filtering, notification deduplication, subscription validation, VAPID signatures and order-tab form associations. DOM tests do not establish visual fidelity, device push delivery or physical-phone behavior.
