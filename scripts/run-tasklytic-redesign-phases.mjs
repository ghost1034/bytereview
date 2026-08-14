#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const defaultPlan = "plans/TASKLYTIC.md";
const runnerName = "tasklytic-redesign";
const runnerLabel = "Tasklytic Redesign";
const codexBin = process.env.CODEX_BIN || 'codex';

const usage = `Usage: node ${basename(process.argv[1])} [options]

Runs every incomplete phase in ${defaultPlan}, sequentially, with one fresh
persisted Codex session per phase.

Options:
  --plan PATH     Override the configured plan path
  --dry-run       Print sessions without starting Codex
  --from N        Start or restart at phase N
  --through N     Stop after phase N
  --restart       Clear saved completion state and start at Phase 1
  --help          Show this help

Environment:
  CODEX_BIN       Codex executable to use (default: codex)
`;

function fail(message) {
  console.error(`\n${runnerLabel} phase runner: ${message}`);
  process.exit(1);
}

function positiveInteger(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    fail(`${flag} requires a positive integer.`);
  }
  return number;
}

function parseArgs(argv) {
  const options = {
    plan: defaultPlan,
    dryRun: false,
    from: undefined,
    through: undefined,
    restart: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--restart') {
      options.restart = true;
    } else if (['--plan', '--from', '--through'].includes(argument)) {
      const value = argv[index + 1];
      if (value === undefined) {
        fail(`${argument} requires a value.`);
      }
      if (argument === '--plan') {
        options.plan = value;
      } else {
        options[argument.slice(2)] = positiveInteger(value, argument);
      }
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      console.log(usage);
      process.exit(0);
    } else {
      fail(`unknown option: ${argument}\n\n${usage}`);
    }
  }
  return options;
}

function parsePhases(markdown) {
  const headingPattern = /^###\s+(\d+)\.\s+(.+)$/gm;
  const headings = [...markdown.matchAll(headingPattern)];
  if (headings.length === 0) {
    fail('no numbered phase headings were found.');
  }

  const phases = headings.map((heading, index) => {
    const number = Number(heading[1]);
    const expected = index + 1;
    if (number !== expected) {
      fail(`expected Phase ${expected}, but found Phase ${number}.`);
    }
    const end = headings[index + 1]?.index ?? markdown.length;
    return {
      number,
      title: heading[2].trim(),
      section: markdown.slice(heading.index, end).trim(),
    };
  });

  const exitGateCount = phases.filter((phase) => /^Exit gate:/im.test(phase.section)).length;
  if (exitGateCount > 0 && exitGateCount !== phases.length) {
    fail('Exit gate sections are inconsistent; add one to every phase or remove all of them.');
  }
  return phases;
}

function atomicJson(path, value) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

function newState(planHash) {
  return {
    planHash,
    completedPhases: [],
    phaseResults: {},
    activePhase: null,
    updatedAt: new Date().toISOString(),
  };
}

function phasePrompt(phase, relativePlan) {
  return `Implement exactly Phase ${phase.number} of ${relativePlan}: ${phase.title}.

Read the complete plan and every applicable AGENTS.md before changing anything.
Start from the current working tree, including predecessor phases and unrelated
user changes. Preserve unrelated work and inspect the real implementation.

Complete every requirement in this phase and any exit gate it includes. Run focused checks
first, then every verification required by the plan. Fix in-scope failures and
do not begin a later phase. Make reasonable safe decisions without waiting for
interactive input.

You may create scoped local commits for this phase. Never commit unrelated
pre-existing changes. Do not deploy, push, or open a pull request. Use status
"blocked" only when human action is genuinely required before the next phase.

The exact phase section follows:

${phase.section}

Return a final response matching the supplied JSON schema. Use "completed" only
when the phase and any included exit gate are genuinely complete. Include changed files,
important verification results, local commit hashes, and concrete blockers.`;
}

function runCodex(args, prompt, repoRoot) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(codexBin, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    child.on('error', rejectPromise);
    child.on('close', (code, signal) => resolvePromise({ code, signal }));
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') rejectPromise(error);
    });
    child.stdin.end(prompt);
  });
}

const options = parseArgs(process.argv.slice(2));
let repoRoot;
let gitDir;
try {
  repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch {
  fail('run this command inside a Git working tree.');
}

try {
  execFileSync(codexBin, ['exec', '--help'], { cwd: repoRoot, stdio: 'ignore' });
} catch {
  fail(`could not run "${codexBin} exec --help". Install or authenticate Codex first.`);
}

const planPath = resolve(repoRoot, options.plan);
if (!planPath.startsWith(`${repoRoot}/`) || !existsSync(planPath)) {
  fail(`plan not found inside the repository: ${planPath}`);
}
const relativePlan = planPath.slice(repoRoot.length + 1);
const plan = readFileSync(planPath, 'utf8');
const phases = parsePhases(plan);
const lastPhase = phases.at(-1).number;
const planHash = createHash('sha256').update(plan).digest('hex');

if (options.from !== undefined && options.from > lastPhase) {
  fail(`--from ${options.from} is beyond Phase ${lastPhase}.`);
}
if (options.through !== undefined && options.through > lastPhase) {
  fail(`--through ${options.through} is beyond Phase ${lastPhase}.`);
}
if (options.from !== undefined && options.through !== undefined && options.from > options.through) {
  fail('--from cannot be greater than --through.');
}

const planSlug = basename(relativePlan, extname(relativePlan))
  .toLowerCase()
  .replaceAll(/[^a-z0-9]+/g, '-')
  .replaceAll(/^-|-$/g, '');
const stateDir = join(gitDir, 'codex-phase-runners', `${runnerName}-${planSlug}`);
const statePath = join(stateDir, 'progress.json');
let state = newState(planHash);

if (existsSync(statePath) && !options.restart) {
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    fail(`saved progress is invalid; inspect ${statePath} or use --restart.`);
  }
  if (state.planHash !== planHash) {
    fail('the plan changed since the saved run; review it, then use --restart.');
  }
}

let startPhase = options.from;
if (startPhase === undefined) {
  startPhase = phases.find((phase) => !state.completedPhases.includes(phase.number))?.number;
}
if (startPhase === undefined) {
  console.log(`All ${lastPhase} phases are already marked completed.`);
  console.log('Use --restart to run the plan again.');
  process.exit(0);
}

const throughPhase = options.through ?? lastPhase;
const selected = phases.filter(
  (phase) => phase.number >= startPhase && phase.number <= throughPhase,
);
if (selected.length === 0) fail('no phases matched the selected range.');

console.log(`Plan: ${planPath}`);
console.log(`Sessions: Phase ${selected[0].number} through Phase ${selected.at(-1).number}`);
console.log(`Codex: ${codexBin} exec --dangerously-bypass-approvals-and-sandbox`);
if (options.dryRun) {
  for (const phase of selected) {
    console.log(`  Phase ${phase.number}: ${phase.title} (fresh session)`);
  }
  process.exit(0);
}

mkdirSync(stateDir, { recursive: true });
const lockPath = join(stateDir, 'runner.lock');
try {
  const descriptor = openSync(lockPath, 'wx');
  writeFileSync(descriptor, `${process.pid}\n`);
  closeSync(descriptor);
} catch {
  fail(`another runner may be active; otherwise remove stale lock ${lockPath}.`);
}

let lockHeld = true;
function releaseLock() {
  if (lockHeld && existsSync(lockPath)) {
    unlinkSync(lockPath);
    lockHeld = false;
  }
}
process.on('exit', releaseLock);

if (options.restart) state = newState(planHash);
if (options.from !== undefined) {
  state.completedPhases = state.completedPhases.filter((number) => number < options.from);
  for (const number of Object.keys(state.phaseResults)) {
    if (Number(number) >= options.from) delete state.phaseResults[number];
  }
}

const resultSchema = {
  type: 'object',
  properties: {
    phase: { type: 'integer' },
    status: { type: 'string', enum: ['completed', 'blocked'] },
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    verification: { type: 'array', items: { type: 'string' } },
    commits: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
  },
  required: ['phase', 'status', 'summary', 'files_changed', 'verification', 'commits', 'blockers'],
  additionalProperties: false,
};
const schemaPath = join(stateDir, 'phase-result.schema.json');
atomicJson(schemaPath, resultSchema);
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const runDir = join(stateDir, 'runs', runId);
mkdirSync(runDir, { recursive: true });

for (const phase of selected) {
  const resultPath = join(runDir, `phase-${String(phase.number).padStart(2, '0')}.json`);
  state.activePhase = phase.number;
  state.updatedAt = new Date().toISOString();
  atomicJson(statePath, state);

  console.log(`\n${'='.repeat(72)}`);
  console.log(`Starting fresh Codex session for Phase ${phase.number}: ${phase.title}`);
  console.log(`${'='.repeat(72)}\n`);

  let outcome;
  try {
    outcome = await runCodex(
      [
        'exec', '--cd', repoRoot,
        '--dangerously-bypass-approvals-and-sandbox',
        '--output-schema', schemaPath,
        '--output-last-message', resultPath,
        '-',
      ],
      phasePrompt(phase, relativePlan),
      repoRoot,
    );
  } catch (error) {
    state.activePhase = null;
    state.updatedAt = new Date().toISOString();
    atomicJson(statePath, state);
    releaseLock();
    fail(`could not start Phase ${phase.number}: ${error.message}`);
  }

  if (outcome.code !== 0) {
    state.activePhase = null;
    state.updatedAt = new Date().toISOString();
    atomicJson(statePath, state);
    releaseLock();
    const detail = outcome.signal ? `signal ${outcome.signal}` : `exit code ${outcome.code}`;
    fail(`Phase ${phase.number} ended with ${detail}; re-run to retry it.`);
  }

  let result;
  try {
    result = JSON.parse(readFileSync(resultPath, 'utf8'));
  } catch {
    state.activePhase = null;
    state.updatedAt = new Date().toISOString();
    atomicJson(statePath, state);
    releaseLock();
    fail(`Phase ${phase.number} did not produce a valid result at ${resultPath}.`);
  }
  if (result.phase !== phase.number) {
    releaseLock();
    fail(`Phase ${phase.number} returned a result for Phase ${result.phase}.`);
  }

  state.phaseResults[phase.number] = {
    ...result,
    resultPath,
    finishedAt: new Date().toISOString(),
  };
  state.activePhase = null;
  state.updatedAt = new Date().toISOString();
  if (result.status !== 'completed') {
    atomicJson(statePath, state);
    releaseLock();
    console.error(`\nPhase ${phase.number} is blocked; later phases were not started.`);
    for (const blocker of result.blockers) console.error(`  - ${blocker}`);
    console.error(`Result: ${resultPath}`);
    process.exit(1);
  }

  if (!state.completedPhases.includes(phase.number)) {
    state.completedPhases.push(phase.number);
    state.completedPhases.sort((left, right) => left - right);
  }
  atomicJson(statePath, state);
  console.log(`\nPhase ${phase.number} completed. Continuing.`);
}

releaseLock();
console.log(`\nCompleted Phases ${selected[0].number}-${selected.at(-1).number}.`);
console.log(`Results and resumable state: ${stateDir}`);
console.log('The runner did not deploy, push, or open a pull request.');
