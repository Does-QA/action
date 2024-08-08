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

## Example Usage

```yaml
name: DoesQA Test Run Workflow

on: [push]

jobs:
  doesqa-test-run:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger DoesQA Test Run
        uses: Does-QA/action@v1.0.3
        with:
          key: ${{ secrets.DOESQA_KEY }}
          accountId: ${{ secrets.DOESQA_ACCOUNT_ID }}
          label: 'Nightly Test Run'
          withAll: 'tag1,tag2'
          withoutAny: 'wip'
          values: '{"URL": "https://example.com", "SomeOtherValue": "Value"}'
          wait: 'true'
          timeout: '1800'
```

## Outputs
This action does not have any outputs.

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support
If you have any questions or need help, please use the [DoesQA Support](https://app.does.qa/app/help) page in the app.