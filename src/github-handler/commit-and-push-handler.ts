// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
  Changes,
  FileData,
  TreeObject,
  Logger,
  Octokit,
  RepoDomain,
} from '../types';

/**
 * Generate and return a GitHub tree object structure
 * containing the target change data
 * See https://developer.github.com/v3/git/trees/#tree-object
 * @param {Changes} changes the set of repository changes
 * @returns {TreeObject[]} The new GitHub changes
 */
function generateTreeObjects(changes: Changes): TreeObject[] {
  const tree: TreeObject[] = [];
  changes.forEach((fileData: FileData, path: string) => {
    if (fileData.content == null) {
      // if no file content then file is deleted
      tree.push({
        path,
        mode: fileData.mode,
        type: 'blob',
        sha: null,
      });
    } else {
      // update file with its content
      tree.push({
        path,
        mode: fileData.mode,
        type: 'blob',
        content: fileData.content,
      });
    }
  });
  return tree;
}

/**
 * Upload and create a remote GitHub tree
 * and resolves with the new tree SHA.
 * Rejects if GitHub V3 API fails with the GitHub error response
 * @param {Octokit} octokit The authenticated octokit instance
 * @param {RepoDomain} origin the the remote repository to push changes to
 * @param {string} refHead the base of the new commit(s)
 * @param {TreeObject[]} tree the set of GitHub changes to upload
 * @returns {Promise<string>} the GitHub tree SHA
 */
async function createTree(
  logger: Logger,
  octokit: Octokit,
  origin: RepoDomain,
  refHead: string,
  tree: TreeObject[]
): Promise<string> {
  const oldTreeSha = (
    await octokit.git.getCommit({
      owner: origin.owner,
      repo: origin.repo,
      commit_sha: refHead,
    })
  ).data.tree.sha;
  logger.info('Got the latest commit tree');
  const treeSha = (
    await octokit.git.createTree({
      owner: origin.owner,
      repo: origin.repo,
      tree,
      base_tree: oldTreeSha,
    })
  ).data.sha;
  logger.info(
    `Successfully created a tree with the desired changes with SHA ${treeSha}`
  );
  return treeSha;
}

/**
 * Create a commit with a repo snapshot SHA on top of the reference HEAD
 * and resolves with the SHA of the commit.
 * Rejects if GitHub V3 API fails with the GitHub error response
 * @param {Logger} logger The logger instance
 * @param {Octokit} octokit The authenticated octokit instance
 * @param {RepoDomain} origin the the remote repository to push changes to
 * @param {string} refHead the base of the new commit(s)
 * @param {string} treeSha the tree SHA that this commit will point to
 * @param {string} message the message of the new commit
 * @returns {Promise<string>} the new commit SHA
 */
async function createCommit(
  logger: Logger,
  octokit: Octokit,
  origin: RepoDomain,
  refHead: string,
  treeSha: string,
  message: string
): Promise<string> {
  const commitData = (
    await octokit.git.createCommit({
      owner: origin.owner,
      repo: origin.repo,
      message,
      tree: treeSha,
      parents: [refHead],
    })
  ).data;
  logger.info(`Successfully created commit. See commit at ${commitData.url}`);
  return commitData.sha;
}

/**
 * Update a reference to a SHA
 * Rejects if GitHub V3 API fails with the GitHub error response
 * @param {Logger} logger The logger instance
 * @param {Octokit} octokit The authenticated octokit instance
 * @param {RepoDomain} origin the the remote repository to push changes to
 * @param {string} refName the name of the branch ref
 * @param {string} newSha the ref to update the commit HEAD to
 * @returns {Promise<void>}
 */
async function updateRef(
  logger: Logger,
  octokit: Octokit,
  origin: RepoDomain,
  refName: string,
  newSha: string
): Promise<void> {
  await octokit.git.updateRef({
    owner: origin.owner,
    repo: origin.repo,
    ref: `heads/${refName}`,
    sha: newSha,
  });
  logger.info(`Successfully updated reference ${refName} to ${newSha}`);
}

/**
 * Given a set of changes, apply the commit(s) on top of the given branch's head and upload it to GitHub
 * Rejects if GitHub V3 API fails with the GitHub error response
 * @param {Logger} logger The logger instance
 * @param {Octokit} octokit The authenticated octokit instance
 * @param {string} refHead the base of the new commit(s)
 * @param {Changes} changes the set of repository changes
 * @param {RepoDomain} origin the the remote repository to push changes to
 * @param {string} originBranchName the remote branch that will contain the new changes
 * @param {string} commitMessage the message of the new commit
 * @returns {Promise<void>}
 */
async function commitAndPush(
  logger: Logger,
  octokit: Octokit,
  refHead: string,
  changes: Changes,
  origin: RepoDomain,
  originBranchName: string,
  commitMessage: string
) {
  try {
    const tree = generateTreeObjects(changes);
    const treeSha = await createTree(logger, octokit, origin, refHead, tree);
    const commitSha = await createCommit(
      logger,
      octokit,
      origin,
      refHead,
      treeSha,
      commitMessage
    );
    await updateRef(logger, octokit, origin, originBranchName, commitSha);
  } catch (err) {
    logger.error('Error while creating a tree and updating the ref');
    throw err;
  }
}

export {
  commitAndPush,
  createCommit,
  generateTreeObjects,
  createTree,
  updateRef,
};
