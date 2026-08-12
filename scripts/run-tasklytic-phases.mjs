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
import { dirname, join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const planPath = join(repoRoot, 'plans', 'TASKLYTIC.md');
const codexBin = process.env.CODEX_BIN || 'codex';

const usage = `Usage: npm run tasklytic:phases -- [options]

Runs every incomplete phase in plans/TASKLYTIC.md, sequentially, with one new
persisted Codex session per phase.

Options:
  --dry-run       Print the sessions that would run without starting Codex
  --from N        Start (or restart) at phase N
  --through N     Stop after phase N
  --restart       Clear saved completion state and start again at Phase 1
  --help          Show this help

Environment:
  CODEX_BIN       Codex executable to use (default: codex)
`;

function fail(message) {
  console.error(`\nTasklytic phase runner: ${message}`);
  process.exit(1);
}

function parsePositiveInteger(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    fail(`${flag} requires a positive integer.`);
  }
  return number;
}

function parseArgs(argv) {
  const options = {
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
    } else if (argument === '--from' || argument === '--through') {
      const value = argv[index + 1];
      if (value === undefined) {
        fail(`${argument} requires a value.`);
      }
      options[argument.slice(2)] = parsePositiveInteger(value, argument);
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
  const headingPattern = /^### Phase (\d+)\s+[—-]\s+(.+)$/gm;
  const headings = [...markdown.matchAll(headingPattern)];

  if (headings.length === 0) {
    fail('no phase headings were found in plans/TASKLYTIC.md.');
  }

  return headings.map((heading, index) => {
    const number = Number(heading[1]);
    const expected = index + 1;
    if (number !== expected) {
      fail(`expected Phase ${expected}, but found Phase ${number}.`);
    }

    const start = heading.index;
    const end = headings[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(start, end).trim();
    if (!/^Exit gate:/m.test(section)) {
      fail(`Phase ${number} does not contain an Exit gate.`);
    }

    return { number, title: heading[2].trim(), section };
  });
}

function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporaryPath, path);
}

function initialState(planHash) {
  return {
    planHash,
    completedPhases: [],
    phaseResults: {},
    activePhase: null,
    updatedAt: new Date().toISOString(),
  };
}

function phasePrompt(phase) {
  return `Implement exactly Phase ${phase.number} of plans/TASKLYTIC.md: ${phase.title}.

Read and follow AGENTS.md and the complete plans/TASKLYTIC.md before changing
anything. Start from the current working tree, which includes the work from all
predecessor phases and may contain unrelated user changes. Preserve those
changes. Inspect the real implementation before deciding what to edit. Treat
plans/TASKLYTIC.md as the runner's immutable input; do not edit that file.

Complete every requirement in this phase and satisfy its exit gate end to end.
Run focused checks first, followed by every verification required by this phase
and by the plan's Verification Rules. Fix failures caused by this phase. Do not
start a later phase.

Do not deploy to production or any shared environment. Do not push, create a
pull request, create a commit, reset, revert, or discard existing changes. Do
not weaken tests or quality gates to make verification pass. Make reasonable,
safe implementation decisions without waiting for interactive input. If a real
external dependency makes the exit gate impossible, preserve useful in-scope
work and report the phase as blocked.

The exact phase section is reproduced below:

${phase.section}

Your final response must match the supplied JSON schema. Use status "completed"
only if every phase requirement and the exit gate are genuinely complete.
Otherwise use "blocked" and list the concrete blockers. Include the important
verification commands/results and changed files.`;
}

function runCodex(args, prompt) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(codexBin, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    child.on('error', rejectPromise);
    child.on('close', (code, signal) => resolvePromise({ code, signal }));
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') {
        rejectPromise(error);
      }
    });
    child.stdin.end(prompt);
  });
}

const options = parseArgs(process.argv.slice(2));

if (!existsSync(planPath)) {
  fail(`plan not found: ${planPath}`);
}

let gitDir;
try {
  gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch {
  fail(`${repoRoot} is not a Git working tree.`);
}

try {
  execFileSync(codexBin, ['exec', '--help'], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
} catch {
  fail(`could not run "${codexBin} exec --help". Install or authenticate the Codex CLI first.`);
}

const plan = readFileSync(planPath, 'utf8');
const phases = parsePhases(plan);
const lastPhase = phases.at(-1).number;
const planHash = createHash('sha256').update(plan).digest('hex');

if (options.from !== undefined && options.from > lastPhase) {
  fail(`--from ${options.from} is beyond the final phase (${lastPhase}).`);
}
if (options.through !== undefined && options.through > lastPhase) {
  fail(`--through ${options.through} is beyond the final phase (${lastPhase}).`);
}
if (
  options.from !== undefined &&
  options.through !== undefined &&
  options.from > options.through
) {
  fail('--from cannot be greater than --through.');
}

const stateDir = join(gitDir, 'codex-tasklytic');
const statePath = join(stateDir, 'progress.json');
let state = initialState(planHash);

if (existsSync(statePath) && !options.restart) {
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    fail(`saved progress is invalid; inspect ${statePath} or use --restart.`);
  }
  if (state.planHash !== planHash) {
    fail('plans/TASKLYTIC.md changed since the saved run. Review it, then use --restart.');
  }
}

let startPhase = options.from;
if (startPhase === undefined) {
  startPhase = phases.find(
    (phase) => !state.completedPhases.includes(phase.number),
  )?.number;
}

if (startPhase === undefined) {
  console.log(`All ${lastPhase} Tasklytic phases are already marked completed.`);
  console.log('Use --restart to run the full plan again.');
  process.exit(0);
}

const throughPhase = options.through ?? lastPhase;
const selectedPhases = phases.filter(
  (phase) => phase.number >= startPhase && phase.number <= throughPhase,
);

if (selectedPhases.length === 0) {
  fail('no phases matched the selected range.');
}

console.log(`Tasklytic plan: ${planPath}`);
console.log(`Sessions: Phase ${selectedPhases[0].number} through Phase ${selectedPhases.at(-1).number}`);
console.log(`Codex: ${codexBin} exec --sandbox workspace-write --approve-for-me`);

if (options.dryRun) {
  for (const phase of selectedPhases) {
    const status = state.completedPhases.includes(phase.number)
      ? 'restart completed phase'
      : 'new session';
    console.log(`  Phase ${phase.number}: ${phase.title} (${status})`);
  }
  process.exit(0);
}

mkdirSync(stateDir, { recursive: true });
const lockPath = join(stateDir, 'runner.lock');
let lockDescriptor;
try {
  lockDescriptor = openSync(lockPath, 'wx');
  writeFileSync(lockDescriptor, `${process.pid}\n`);
  closeSync(lockDescriptor);
} catch {
  fail(`another runner may be active. If not, remove the stale lock at ${lockPath}.`);
}

let lockHeld = true;
function releaseLock() {
  if (lockHeld && existsSync(lockPath)) {
    unlinkSync(lockPath);
    lockHeld = false;
  }
}
process.on('exit', releaseLock);

if (options.restart) {
  state = initialState(planHash);
}
if (options.from !== undefined) {
  state.completedPhases = state.completedPhases.filter(
    (number) => number < options.from,
  );
  for (const number of Object.keys(state.phaseResults)) {
    if (Number(number) >= options.from) {
      delete state.phaseResults[number];
    }
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
    blockers: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'phase',
    'status',
    'summary',
    'files_changed',
    'verification',
    'blockers',
  ],
  additionalProperties: false,
};
const schemaPath = join(stateDir, 'phase-result.schema.json');
writeJsonAtomically(schemaPath, resultSchema);

const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const runDir = join(stateDir, 'runs', runId);
mkdirSync(runDir, { recursive: true });

for (const phase of selectedPhases) {
  const resultPath = join(
    runDir,
    `phase-${String(phase.number).padStart(2, '0')}-result.json`,
  );

  state.activePhase = phase.number;
  state.updatedAt = new Date().toISOString();
  writeJsonAtomically(statePath, state);

  console.log(`\n${'='.repeat(72)}`);
  console.log(`Starting fresh Codex session for Phase ${phase.number}: ${phase.title}`);
  console.log(`${'='.repeat(72)}\n`);

  let outcome;
  try {
    outcome = await runCodex(
      [
        'exec',
        '--cd',
        repoRoot,
        '--sandbox',
        'workspace-write',
        '--approve-for-me',
        '--output-schema',
        schemaPath,
        '--output-last-message',
        resultPath,
        '-',
      ],
      phasePrompt(phase),
    );
  } catch (error) {
    state.activePhase = null;
    state.updatedAt = new Date().toISOString();
    writeJsonAtomically(statePath, state);
    releaseLock();
    fail(`could not start Codex for Phase ${phase.number}: ${error.message}`);
  }

  if (outcome.code !== 0) {
    state.activePhase = null;
    state.updatedAt = new Date().toISOString();
    writeJsonAtomically(statePath, state);
    releaseLock();
    const detail = outcome.signal
      ? `signal ${outcome.signal}`
      : `exit code ${outcome.code}`;
    fail(`Phase ${phase.number} Codex session ended with ${detail}. Re-run the script to retry it.`);
  }

  let result;
  try {
    result = JSON.parse(readFileSync(resultPath, 'utf8'));
  } catch {
    state.activePhase = null;
    state.updatedAt = new Date().toISOString();
    writeJsonAtomically(statePath, state);
    releaseLock();
    fail(`Phase ${phase.number} did not produce a valid result at ${resultPath}.`);
  }

  if (result.phase !== phase.number) {
    state.activePhase = null;
    state.updatedAt = new Date().toISOString();
    writeJsonAtomically(statePath, state);
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
    writeJsonAtomically(statePath, state);
    releaseLock();
    console.error(`\nPhase ${phase.number} is blocked; later phases were not started.`);
    for (const blocker of result.blockers) {
      console.error(`  - ${blocker}`);
    }
    console.error(`Result: ${resultPath}`);
    process.exit(1);
  }

  if (!state.completedPhases.includes(phase.number)) {
    state.completedPhases.push(phase.number);
    state.completedPhases.sort((left, right) => left - right);
  }
  writeJsonAtomically(statePath, state);
  console.log(`\nPhase ${phase.number} passed its exit gate. Continuing.`);
}

releaseLock();
console.log(`\nCompleted Tasklytic Phases ${selectedPhases[0].number}-${selectedPhases.at(-1).number}.`);
console.log(`Results and resumable state: ${stateDir}`);
console.log('No deployment, commit, push, or pull request was performed by the runner.');
