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
        let timeout = parseInt(core.getInput('timeout') || 1200);

        if(timeout > 1200) {
            core.info(`Timeout was set to over 1200 (20 minutes), limiting to 20 minutes. Consider splitting runs for faster results.`);
            timeout = 1200;
        }

        const params = {
            label,
            key,
            withAll,
            withoutAny
        };

        const postUrl = `https://app.does.qa/api/hook/${accountId}`;
        const postResponse = await axios.post(postUrl, {
            ...JSON.parse(values),
        }, {
            params
        });

        const [numericRunId, runId] = postResponse.data.runId;
        const { createdTestsCount, foundFlowsCount } = postResponse.data;

        core.info(`[${runId}] Running ${createdTestsCount} from ${foundFlowsCount}`)

        if(!wait) {
            core.info(`[${runId}] Skipping waiting for run to complete`);
            return
        }

        let complete = false;
        const startTime = Date.now();
        const pollingUrl = `https://app.does.qa/api/v2/community/accounts/${accountId}/runs/${numericRunId}/status`;
        while (!complete && Date.now() - startTime < timeout * 1000) {

            core.info('Checking run status...');

            const pollResponse = await axios.get(pollingUrl, {
                headers: {
                    'x-api-key': key,
                    'x-account': accountId
                }
            }).catch(error => {
                core.setFailed(`Failed to get run status: ${error.message}`);
            });

            if (['passed', 'failed'].includes(pollResponse.data.status)) {
                complete = true;
                core.info(`Test run ${runId} completed with status: ${pollResponse.data.status}`);
            } else {
                core.info('Run is not complete. Waiting...');
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before polling again
            }
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();