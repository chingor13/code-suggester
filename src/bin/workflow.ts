import {Changes, CreatePullRequestUserOptions} from '../types';
import {Octokit} from '@octokit/rest';
import * as git from './handle-git-dir-change';
import {createPullRequest} from '../';
import {logger, setupLogger} from '../logger';
import * as yargs from 'yargs';

export const CREATE_PR_COMMAND = 'pr';

/**
 * map yargs to user pull request otions
 */
export function coerceUserCreatePullRequestOptions(): CreatePullRequestUserOptions {
  return {
    upstreamRepo: yargs.argv.upstreamRepo as string,
    upstreamOwner: yargs.argv.upstreamOwner as string,
    message: yargs.argv.message as string,
    description: yargs.argv.description as string,
    title: yargs.argv.title as string,
    branch: yargs.argv.branch as string,
    force: yargs.argv.force as boolean,
    primary: yargs.argv.primary as string,
    maintainersCanModify: yargs.argv.maintainersCanModify as boolean,
  };
}

/**
 * main workflow entrance
 */
export async function main() {
  try {
    setupLogger();
    const options = coerceUserCreatePullRequestOptions();
    if (!process.env.ACCESS_TOKEN) {
      throw Error('The ACCESS_TOKEN should not be undefined');
    }
    const octokit = new Octokit({auth: process.env.ACCESS_TOKEN});
    let changes: Changes;
    switch (yargs.argv._[0]) {
      case CREATE_PR_COMMAND:
        changes = await git.getChanges(yargs.argv['git-dir'] as string);
        await createPullRequest(octokit, changes, options, logger);
        break;
      default:
        // yargs should have caught this.
        throw Error(`Unhandled command detected: ${yargs.argv._[0]}`);
    }
  } catch (err) {
    logger.error('Workflow failed');
    throw err;
  }
}
