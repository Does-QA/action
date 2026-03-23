import * as core from '@actions/core';
import * as github from '@actions/github';
import axios from 'axios';

const DOESQA_BASE = 'https://app.does.qa';
const TERMINAL_STATUSES = [
    'never_run', 'ignored', 'passed', 'passed_with_warning',
    'failed', 'rejected', 'terminated'
];
const FAILURE_STATUSES = ['rejected', 'failed', 'terminated'];
const CHECK_NAME = 'DoesQA Test Run';

function statusEmoji(status) {
    const map = {
        passed: '\u2705',
        passed_with_warning: '\u26A0\uFE0F',
        failed: '\u274C',
        rejected: '\u274C',
        terminated: '\u26D4',
        never_run: '\u23ED\uFE0F',
        ignored: '\u23ED\uFE0F',
    };
    return map[status] || '\u2753';
}

function statusLabel(status) {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function buildReportUrl(numericRunId) {
    return `${DOESQA_BASE}/app/runs/${numericRunId}`;
}

function checkConclusion(status) {
    if (['passed'].includes(status)) return 'success';
    if (['passed_with_warning'].includes(status)) return 'neutral';
    if (FAILURE_STATUSES.includes(status)) return 'failure';
    if (['never_run', 'ignored'].includes(status)) return 'skipped';
    return 'cancelled';
}

function buildSummaryMarkdown({ status, reportUrl, createdTestsCount, flowCount, runId, label, elapsed }) {
    const emoji = statusEmoji(status);
    const heading = `${emoji} DoesQA Test Run \u2014 ${statusLabel(status)}`;

    const rows = [
        ['Status', `${emoji} **${statusLabel(status)}**`],
        ['Tests', `${createdTestsCount}`],
        ['Run ID', `\`${runId}\``],
    ];
    if (flowCount) rows.splice(2, 0, ['Flows', `${flowCount}`]);
    if (label) rows.push(['Label', label]);
    if (elapsed != null) rows.push(['Duration', `${Math.round(elapsed / 1000)}s`]);

    const table = rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n');

    return [
        `### ${heading}`,
        '',
        '| | |',
        '|---|---|',
        table,
        '',
        `[View full report on DoesQA](${reportUrl})`,
    ].join('\n');
}

function buildTriggeredMarkdown({ reportUrl, runId, label }) {
    const rows = [
        ['Status', '\uD83D\uDE80 **Triggered**'],
        ['Run ID', `\`${runId}\``],
    ];
    if (label) rows.push(['Label', label]);

    const table = rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n');

    return [
        '### \uD83D\uDE80 DoesQA Test Run \u2014 Triggered',
        '',
        'Tests have been triggered and are running in DoesQA. This action was configured not to wait for results.',
        '',
        '| | |',
        '|---|---|',
        table,
        '',
        `[View results on DoesQA](${reportUrl})`,
    ].join('\n');
}

async function writeSummary(md) {
    await core.summary.addRaw(md).write();
}

async function createCheckRun(token, { status, summary, reportUrl, startedAt }) {
    if (!token) return null;

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const headSha = github.context.payload.pull_request?.head?.sha || github.context.sha;

    const { data } = await octokit.rest.checks.create({
        owner,
        repo,
        name: CHECK_NAME,
        head_sha: headSha,
        status: 'in_progress',
        started_at: startedAt,
        output: {
            title: `${CHECK_NAME} \u2014 In Progress`,
            summary: summary,
        },
        details_url: reportUrl,
    });

    core.info(`Created Check Run "${CHECK_NAME}" (id: ${data.id}).`);
    return data.id;
}

async function completeCheckRun(token, checkRunId, { status, summary, reportUrl }) {
    if (!token || !checkRunId) return;

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;
    const conclusion = checkConclusion(status);

    await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status: 'completed',
        conclusion,
        completed_at: new Date().toISOString(),
        output: {
            title: `${CHECK_NAME} \u2014 ${statusLabel(status)}`,
            summary: summary,
        },
        details_url: reportUrl,
    });

    core.info(`Check Run updated: conclusion=${conclusion}.`);
}

async function run() {
    let checkRunId = null;
    const githubToken = core.getInput('github-token');

    try {
        const accountId = core.getInput('accountId');
        const label = core.getInput('label');
        const key = core.getInput('key');
        const withAll = core.getInput('withAll');
        const withoutAny = core.getInput('withoutAny');
        const values = core.getInput('values') || '{}';
        const wait = core.getInput('wait') !== 'false';
        const concurrency = Math.max(parseInt(core.getInput('concurrency') || 1), 0);
        const recipe = core.getInput('recipe') || undefined;
        const testsTagged = core.getInput('testsTagged') || undefined;
        let timeout = Math.min(parseInt(core.getInput('timeout') || 1200), 2400);

        if (timeout > 1200) {
            core.info('Timeout was set to over 20 minutes. Consider splitting runs for faster results.');
        }

        const params = { label, key, withAll, withoutAny, recipe, testsTagged };
        const headers = {};

        if (concurrency > 0) {
            headers['dqa-account.maxConcurrency'] = concurrency;
        }

        const postUrl = `${DOESQA_BASE}/api/hook/${accountId}`;
        let postResponse;

        for (let tryCount = 0; tryCount < 3; tryCount++) {
            try {
                postResponse = await axios.post(postUrl, {
                    ...JSON.parse(values),
                }, {
                    params,
                    headers,
                    validateStatus: (status) => status < 500,
                });
                break;
            } catch (error) {
                await new Promise(resolve => setTimeout(resolve, 20000));
                if (tryCount === 2) {
                    core.setFailed(`Failed to send request after 3 attempts: ${error.message}`);
                    return;
                }
            }
        }

        const [numericRunId, runId] = postResponse.data.runId;
        const createdTestsCount = postResponse.data.createdTestsCount ?? 0;
        const flowCount = postResponse.data.flowCount ?? 0;
        const reportUrl = buildReportUrl(numericRunId);
        const startedAt = new Date().toISOString();

        core.setOutput('report-url', reportUrl);

        core.info(`[${runId}] Running ${createdTestsCount} test${createdTestsCount > 1 ? 's' : ''} from ${flowCount} flow${flowCount > 1 ? 's' : ''}...`);
        core.info(`View the report at: ${reportUrl}`);

        const runMeta = { createdTestsCount, flowCount, runId, label, reportUrl };

        if (createdTestsCount === 0) {
            core.info(`[${runId}] No tests were created. Check the label and values provided.`);
            const md = buildSummaryMarkdown({ ...runMeta, status: 'never_run' });
            await writeSummary(md);

            checkRunId = await createCheckRun(githubToken, { summary: md, reportUrl, startedAt });
            await completeCheckRun(githubToken, checkRunId, { status: 'never_run', summary: md, reportUrl });
            core.setOutput('status', 'never_run');
            return;
        }

        if (!wait) {
            core.info(`[${runId}] Skipping waiting for run to complete`);
            const triggeredMd = buildTriggeredMarkdown({ reportUrl, runId, label });
            await writeSummary(triggeredMd);

            checkRunId = await createCheckRun(githubToken, { summary: triggeredMd, reportUrl, startedAt });
            await completeCheckRun(githubToken, checkRunId, { status: 'ignored', summary: triggeredMd, reportUrl });
            core.setOutput('status', 'triggered');
            return;
        }

        const inProgressMd = buildSummaryMarkdown({ ...runMeta, status: 'running' });
        checkRunId = await createCheckRun(githubToken, { summary: inProgressMd, reportUrl, startedAt });

        let complete = false;
        const startTime = Date.now();
        const pollingUrl = `${DOESQA_BASE}/api/v2/community/accounts/${accountId}/runs/${numericRunId}/status`;

        await new Promise(resolve => setTimeout(resolve, 60000));

        let poll = 0;

        while (!complete && Date.now() - startTime < timeout * 1000) {
            poll++;
            const pollResponse = await axios.get(pollingUrl, {
                headers: {
                    'x-api-key': key,
                    'x-account': accountId,
                },
                validateStatus: (status) => status > 500 || status < 300,
            }).catch(error => {
                core.setFailed(`Failed to get run status: ${error.message}`);
            });

            if (!pollResponse || !pollResponse.data || !pollResponse.data.status) {
                await new Promise(resolve => setTimeout(resolve, 20000));
                continue;
            }

            const runStatus = pollResponse.data.status;

            if (TERMINAL_STATUSES.includes(runStatus)) {
                complete = true;
                const elapsed = Date.now() - startTime;

                core.info(`Test run ${runId} completed with status: ${runStatus}`);
                core.setOutput('status', runStatus);

                const md = buildSummaryMarkdown({ ...runMeta, status: runStatus, elapsed });
                await writeSummary(md);
                await completeCheckRun(githubToken, checkRunId, { status: runStatus, summary: md, reportUrl });

                if (FAILURE_STATUSES.includes(runStatus)) {
                    core.setFailed(`Test run ${runId} failed. View the report at: ${reportUrl}`);
                }
            } else {
                if (poll % 3 === 0) {
                    core.info(`[${runId}] Still running...`);
                }
                await new Promise(resolve => setTimeout(resolve, 20000));
            }
        }

        if (!complete) {
            const elapsed = Date.now() - startTime;
            const md = buildSummaryMarkdown({ ...runMeta, status: 'terminated', elapsed });
            await writeSummary(md);
            await completeCheckRun(githubToken, checkRunId, { status: 'terminated', summary: md, reportUrl });
            core.setOutput('status', 'timeout');
            core.setFailed(`Test run ${runId} timed out after ${timeout}s. View the report at: ${reportUrl}`);
        }
    } catch (error) {
        if (checkRunId && githubToken) {
            try {
                await completeCheckRun(githubToken, checkRunId, {
                    status: 'terminated',
                    summary: `Action failed with error: ${error.message}`,
                    reportUrl: '',
                });
            } catch (_) { /* best-effort */ }
        }
        core.setFailed(error.message);
    }
}

run();
