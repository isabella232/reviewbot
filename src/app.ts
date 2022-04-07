/**
 * @param {import('probot').Probot} app
 */
import type { Probot } from 'probot';
import * as core from '@actions/core';
import { exec as childExec } from 'child_process';
import path from 'path';

type Message = {
  "ruleId": string,
  "severity": number,
  "message": string,
  "line": number,
  "column": number,
  "nodeType": string,
  "messageId": string,
  "endLine": number,
  "endColumn": number
}
type File = {
  filePath: string,
  messages: Array<Message>
}

async function exec(command: string) {
  return new Promise<string>((resolve) => childExec(command, (error, stdout, stderr) => resolve(stdout)));
}

async function lintDiff(baseSha: string, headSha: string, prefix: string): Promise<Array<File>> {
  const cmd = `cd ./${prefix}; git diff --name-only --diff-filter=ACMR ${baseSha}..${headSha} | grep -E '^${prefix}/(.*).[jt]s(x)?$'|sed 's,^${prefix}/,,'|xargs yarn -s eslint -f json`;
  core.info(`Executing command: ${cmd}`);
  const result = await exec(cmd);
  core.info(`Linter result is: ${result}`);
  return JSON.parse(result) as Array<File>;
}

const PR_REVIEW_BODY = 'Hey there! This is the automated PR review service. '
  + ' I have found some issues with the changes you made to JavaScript/TypeScript files.';

const normalizeFilename = (filename: string) => path.relative(process.cwd(), filename);

const makeRuleNameWithUrl = (ruleName: string, url: string) => `[${ruleName}](${url})`;

const formatRuleName = (ruleName: string) => {
  const splittedRuleName = ruleName.split('/');
  if (splittedRuleName.length === 1) {
    makeRuleNameWithUrl(ruleName, `https://eslint.org/docs/rules/${ruleName}`);
  }

  const [domain, ruleId] = splittedRuleName;
  switch (domain) {
    case 'jest':
      return makeRuleNameWithUrl(ruleId, `https://github.com/jest-community/eslint-plugin-jest/blob/main/docs/rules/${ruleId}.md`);
    case 'testing-library': 
      return makeRuleNameWithUrl(ruleId, `https://github.com/testing-library/eslint-plugin-testing-library/blob/main/docs/rules/${ruleId}.md`);
    case '@typescript-eslint':
      return makeRuleNameWithUrl(ruleId, `https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/eslint-plugin/docs/rules/${ruleId}.md`);
  }

  return ruleName;
}

module.exports = (app: Probot) => {
  app.on(["pull_request.opened", "pull_request.synchronize"], async (context) => {
    const prefix = core.getInput('prefix', { required: true });
    const { owner, repo, pull_number } = await context.pullRequest();
    const { data: { base: { sha: baseSha }, head: { sha: headSha } } } = await context.octokit.pulls.get({
      owner,
      repo,
      pull_number,
    });
    const results = await lintDiff(baseSha, headSha, prefix);
    const filesWithErrors = results.filter(result => result.messages.length > 0);
    if (filesWithErrors.length > 0) {
      const comments = filesWithErrors.flatMap(file => file.messages.map(message => ({
        path: normalizeFilename(file.filePath),
        body: `${formatRuleName(message.ruleId)}: ${message.message}`,
        line: message.line
      })));
      return context.octokit.pulls.createReview({
        owner,
        repo,
        pull_number,
        comments,
        body: PR_REVIEW_BODY,
        event: 'REQUEST_CHANGES',
      });
    } else {
      const { data: reviews } = await context.octokit.pulls.listReviews({ repo, pull_number, owner });
      const containsReviewFromMe = reviews.filter(review => review.body === PR_REVIEW_BODY).length > 0;
      if (containsReviewFromMe) {
        return context.octokit.pulls.createReview({
          owner,
          repo,
          pull_number,
          body: 'Thanks for fixing the issues! See you next time!',
          event: 'COMMENT',
        })
      }
    }
  });
};

