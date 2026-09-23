# Contributing

## Local loop

```bash
npm test                                   # node bin/transcriptmeter.mjs check && node --test
node bin/transcriptmeter.mjs --roots test/fixtures/claude,test/fixtures/codex
node bin/transcriptmeter.mjs --since 7d    # your own transcripts, sizes only
npm run backlog && npm run build:site
```

## Adding a field or a harness

1. Confirm the shape on a real file with a keys-only script (see `CLAUDE.md`, "Facts
   the code depends on") — never paste a real transcript anywhere.
2. Extend `test/make-fixtures.mjs` with the shape, regenerate `test/fixtures/`, write the
   assertion first.
3. Date the fact in `CLAUDE.md`.

## Prices

`bin/lib/prices.mjs` is a dated snapshot of list prices. Re-verify against
platform.claude.com/docs/en/about-claude/pricing before every tag, move `PRICES_DATE`,
and the README's date with it (`check` compares them). A model absent from the table is
reported as unpriced, never estimated.

## Backlog, roadmap, issues

`BACKLOG.md` is the single source of truth; `ROADMAP.md` is generated from it and the
GitHub issues are synced from it one way on push to `main`. Items carry a stable `TM-n`
id and a trailing `<!-- tm: prio= size= labels= [ver=] -->` comment.

## Pull requests

`main` is protected: pull request, green CI, no direct pushes. Conventional subject with
the `TM-n` id, a CHANGELOG line under `[Unreleased]`.

## Releasing

Same runbook as trimhook: bump `package.json`, cut `[Unreleased]` into `[x.y.z] — date`,
`ver=main` → `ver=x.y.z`, regenerate the roadmap, land it by pull request, then
`git tag transcriptmeter--v{version} && git push origin transcriptmeter--v{version}`.
The first version is published by hand (`npm publish --access public`), then the trusted
publisher on npmjs.com: user `Allan-Nava`, repository `transcriptmeter`, workflow
`release.yml`, environment empty.
