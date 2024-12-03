const core = require('@actions/core');
const axios = require('axios');

async function run() {
    try {
        // Get inputs
        const accountId = core.getInput('accountId');
        const label = core.getInput('label');
        const key = core.getInput('key');
        const withAll = core.getInput('withAll');
        const withoutAny = core.getInput('withoutAny');
        const values = core.getInput('values') || '{}';
        const wait = core.getInput('wait') === 'true' || true;
        const concurrency = Math.max(parseInt(core.getInput('concurrency') || 1), 0);
        const recipe = core.getInput('recipe') || undefined;
        const testsTagged = core.getInput('testsTagged') || undefined;
        let timeout = Math.min(parseInt(core.getInput('timeout') || 1200), 2400);

        if(timeout > 1200) {
            core.info(`Timeout was set to over 20 minutes. Consider splitting runs for faster results.`);
        }

        const params = {
            label,
            key,
            withAll,
            withoutAny,
            recipe,
            testsTagged
        };

        const headers = {}

        if(concurrency > 0) {
            headers['dqa-account.maxConcurrency'] = concurrency;
        }

        const postUrl = `https://app.does.qa/api/hook/${accountId}`;
        const postResponse = await axios.post(postUrl, {
            ...JSON.parse(values),
        }, {
            params,
            headers
        });

        const [numericRunId, runId] = postResponse.data.runId;
        const { createdTestsCount, foundFlowsCount } = postResponse.data;

        core.info(`[${runId}] Running ${createdTestsCount} test${createdTestsCount > 1 ? 's': ''} from ${foundFlowsCount} flow${foundFlowsCount > 1 ? 's' : ''}...`)
        core.info(`View the report at: https://app.does.qa/app/runs/${numericRunId}`)

        if(createdTestsCount === 0) {
            core.info(`[${runId}] No tests were created. Check the label and values provided.`);
            return
        }

        if(!wait) {
            core.info(`[${runId}] Skipping waiting for run to complete`);
            return
        }

        let complete = false;
        const startTime = Date.now();
        const pollingUrl = `https://app.does.qa/api/v2/community/accounts/${accountId}/runs/${numericRunId}/status`;

        await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for 1 minute before polling

        let poll = 0

        while (!complete && Date.now() - startTime < timeout * 1000) {
            poll++
            const pollResponse = await axios.get(pollingUrl, {
                headers: {
                    'x-api-key': key,
                    'x-account': accountId
                },
                validateStatus: (status) => {
                    if(status > 500 || status < 300) {
                        // Ignore
                        return true;
                    }
                }
            }).catch(error => {
                core.setFailed(`Failed to get run status: ${error.message}`);
            });

            if(!pollResponse || !pollResponse.data || !pollResponse.data.status) {
                await new Promise(resolve => setTimeout(resolve, 20000));
                continue
            }

            if ([
                'never_run',
                'ignored',
                'passed',
                'passed_with_warning',
                'failed',
                'rejected',
                'terminated'
            ].includes(pollResponse.data.status)) {

                complete = true;
                core.info(`Test run ${runId} completed with status: ${pollResponse.data.status}`);

                if(['rejected', 'failed', 'terminated'].includes(pollResponse.data.status)) {
                    core.setFailed(`Test run ${runId} failed. View the report at: https://app.does.qa/app/runs/${numericRunId}`);
                }

            } else {
                if(poll % 3 === 0){
                    core.info(`[${runId}] Still running...`);
                }
                await new Promise(resolve => setTimeout(resolve, 20000)); // Wait for 20 seconds before polling again
            }
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();