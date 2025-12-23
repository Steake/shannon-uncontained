// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $ } from 'zx';
import chalk from 'chalk';

// Silence zx command output to prevent newline spam in CLI
$.quiet = true;
$.verbose = false;

// Check if verbose mode is enabled
const isVerbose = () => process.env.LSG_VERBOSE || process.argv.includes('--verbose') || process.argv.includes('-v');

// Global git operations semaphore to prevent index.lock conflicts during parallel execution
class GitSemaphore {
  constructor() {
    this.queue = [];
    this.running = false;
  }

  async acquire() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.process();
    });
  }

  release() {
    this.running = false;
    this.process();
  }

  process() {
    if (!this.running && this.queue.length > 0) {
      this.running = true;
      const resolve = this.queue.shift();
      resolve();
    }
  }
}

const gitSemaphore = new GitSemaphore();

// Execute git commands with retry logic for index.lock conflicts
export const executeGitCommandWithRetry = async (commandArgs, sourceDir, description, maxRetries = 5) => {
  await gitSemaphore.acquire();

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Handle both array and string commands
        let result;
        if (Array.isArray(commandArgs)) {
          // For arrays like ['git', 'status', '--porcelain'], execute parts separately
          const [cmd, ...args] = commandArgs;
          result = await $`cd ${sourceDir} && ${cmd} ${args}`;
        } else {
          // For string commands
          result = await $`cd ${sourceDir} && ${commandArgs}`;
        }
        return result;
      } catch (error) {
        const isLockError = error.message.includes('index.lock') ||
          error.message.includes('unable to lock') ||
          error.message.includes('Another git process') ||
          error.message.includes('fatal: Unable to create') ||
          error.message.includes('fatal: index file');

        if (isLockError && attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          if (isVerbose()) console.log(chalk.yellow(`    ⚠️ Git lock conflict during ${description} (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`));
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }
  } finally {
    gitSemaphore.release();
  }
};

// Pure functions for Git workspace management - silenced for cleaner CLI
const cleanWorkspace = async (sourceDir, reason = 'clean start') => {
  try {
    // Check for uncommitted changes
    const status = await $`cd ${sourceDir} && git status --porcelain`;
    const hasChanges = status.stdout.trim().length > 0;

    if (hasChanges) {
      await $`cd ${sourceDir} && git reset --hard HEAD`;
      await $`cd ${sourceDir} && git clean -fd`;
    }
    return { success: true, hadChanges: hasChanges };
  } catch (error) {
    return { success: false, error };
  }
};

export const createGitCheckpoint = async (sourceDir, description, attempt) => {
  try {
    // Only clean workspace on retry attempts (attempt > 1), not on first attempts
    if (attempt > 1) {
      await cleanWorkspace(sourceDir, `${description} (retry cleanup)`);
    }

    // Check for uncommitted changes with retry logic
    await executeGitCommandWithRetry(['git', 'status', '--porcelain'], sourceDir, 'status check');

    // Stage changes with retry logic
    await executeGitCommandWithRetry(['git', 'add', '-A'], sourceDir, 'staging changes');

    // Create commit with retry logic
    await executeGitCommandWithRetry(['git', 'commit', '-m', `📍 Checkpoint: ${description} (attempt ${attempt})`, '--allow-empty'], sourceDir, 'creating commit');

    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const commitGitSuccess = async (sourceDir, description) => {
  try {
    // Stage changes with retry logic
    await executeGitCommandWithRetry(['git', 'add', '-A'], sourceDir, 'staging changes for success commit');

    // Create success commit with retry logic
    await executeGitCommandWithRetry(['git', 'commit', '-m', `✅ ${description}: completed successfully`, '--allow-empty'], sourceDir, 'creating success commit');

    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const rollbackGitWorkspace = async (sourceDir, reason = 'retry preparation') => {
  try {
    // Reset to HEAD with retry logic
    await executeGitCommandWithRetry(['git', 'reset', '--hard', 'HEAD'], sourceDir, 'hard reset for rollback');

    // Clean untracked files with retry logic
    await executeGitCommandWithRetry(['git', 'clean', '-fd'], sourceDir, 'cleaning untracked files for rollback');

    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};