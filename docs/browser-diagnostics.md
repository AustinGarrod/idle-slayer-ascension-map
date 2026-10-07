# Browser failure diagnostics

Browser checks run against local production previews or isolated CI builds, with synthetic progress and save fixtures and intercepted analytics. Never run these checks against the production site or add a real player's files to a diagnostic run. Traces contain DOM snapshots, test source and network details; screenshots show the failed scenario.

Playwright keeps a trace and screenshot only for failed tests, produces an HTML report, and records no video. Successful test traces are discarded. Generated `test-results/` and `playwright-report/` stay ignored and outside `dist`.

The CI validation job uploads these two folders only when the browser step fails. Artifacts are named `browser-failure-<run-id>-<attempt>` and expire after five days. A failed browser step still fails validation and blocks the release gate and Pages deployment; an upload does not turn a failed test into success. Cancelled runs may not retain artifacts, and failures before browser tests begin may have only the Actions log. No other workspace directories or hidden files are uploaded. The public repository's artifacts contain only synthetic test data.

## Retrieve a CI failure on Windows

Open the failed Actions run, download its **browser-failure** artifact, and extract it. Alternatively, from the repository checkout:

```powershell
$runId = 123456789 # Replace with the failed Actions run ID.
gh run view $runId --repo AustinGarrod/idle-slayer-ascension-map
gh run download $runId --repo AustinGarrod/idle-slayer-ascension-map --dir .cache/browser-diagnostics/$runId
yarn playwright show-report .cache/browser-diagnostics/$runId/playwright-report
```

Choose the failed test in the report to read assertions and inspect its screenshot and trace timeline. Open a trace directly with the local viewer:

```powershell
yarn playwright show-trace .cache/browser-diagnostics/123456789/test-results/<failed-test>/trace.zip
```

Replace both placeholders with the extracted paths. If several artifacts are downloaded, `gh` may create an artifact-name subdirectory; point the viewer to that directory's `playwright-report` or `test-results`.

## Local failure

Build first and run the affected browser test using the normal local-only configuration:

```powershell
yarn build
yarn test:e2e tests/browser/short-viewports.spec.ts
yarn playwright show-report playwright-report
```

The report never opens automatically. Inspect a failed trace from its report or use `yarn playwright show-trace test-results/<failed-test>/trace.zip`. Copy useful synthetic evidence outside these generated folders before another run replaces it. Retrieve or inspect artifacts before their expiration; do not upload private game files or credentials to an issue.

Configuration follows the official [Playwright recording options](https://playwright.dev/docs/test-use-options#recording-options) and [HTML reporter](https://playwright.dev/docs/test-reporters#html-reporter). The pinned [upload-artifact action](https://github.com/actions/upload-artifact/tree/v7.0.1) documents artifact retention and hidden-file handling.
