# DoesQA GitHub Action

This GitHub Action triggers a test run in DoesQA and waits for it to complete.

## Inputs

- `key` (required): Your DoesQA CI/CD key.
- `accountId` (required): Your DoesQA Account ID.
- `label` (optional): Label for the test run.
- `withAll` (optional): Flow Tags to include.
- `withoutAny` (optional, default: `wip`): Any Flow Tags to exclude.
- `values` (optional): Values to pass to the test run.
- `wait` (optional, default: `true`): Wait for the test run to complete.
- `timeout` (optional, default: `1200`): Timeout in seconds.
- `concurrency` (optional, default: Account Concurrency): Number of concurrent test to run.
- `recipe` (optional): Recipe to use for the test run. (ID)
- `testsTagged` (optional): Run only tests tagged with the specified tag within the filtered flows.
- `github-token` (optional, default: automatic): GitHub token for creating a Check Run with the test results. Uses the workflow's automatic token by default — no configuration needed.

## Outputs

- `status`: Final status of the test run (e.g. `passed`, `failed`, `terminated`, `timeout`).
- `report-url`: URL to the DoesQA report for this run.

## PR Reporting

When this action runs, it produces up to two types of reports:

### Job Summary (always)

A markdown summary card is added to the GitHub Actions run page with the test status, counts, duration, and a link to the full DoesQA report. This works automatically with no extra configuration.

### Check Run (automatic)

The action creates a **Check Run** on the commit using the workflow's built-in token. This appears directly in the PR's **Checks tab** with:

- A pass/fail/neutral conclusion badge
- A rich summary with test counts, duration, and status
- A "Details" link pointing to the full DoesQA report

While tests are running, the Check Run shows as "in progress". Once complete, it updates with the final result.

The only requirement is that the workflow has `checks: write` permission:

```yaml
permissions:
  checks: write
```

To disable Check Run creation, set `github-token` to an empty string.

## Example Usage

```yaml
name: DoesQA Test Run

on:
  pull_request:

permissions:
  checks: write

jobs:
  doesqa-test-run:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger DoesQA Test Run
        uses: Does-QA/action@v1
        with:
          key: ${{ secrets.DOESQA_KEY }}
          accountId: ${{ secrets.DOESQA_ACCOUNT_ID }}
          label: 'PR #${{ github.event.pull_request.number }}'
          withAll: 'tag1,tag2'
          withoutAny: 'wip'
          values: '{"URL": "https://example.com"}'
          wait: 'true'
          timeout: '1800'
          concurrency: 20
          recipe: '4sJz2'
          testsTagged: 'priority'
```

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support
If you have any questions or need help, please use the [DoesQA Support](https://app.does.qa/app/help) page in the app.
