/** Fictional people pool for evaluation tenant members. */
export const EVAL_PEOPLE = [
  { name: 'Jordan Blake', email: 'jblake@eval.tasklytic', jobTitle: 'Partner' },
  { name: 'Alex Rivera', email: 'arivera@eval.tasklytic', jobTitle: 'Director' },
  { name: 'Sam Chen', email: 'schen@eval.tasklytic', jobTitle: 'Manager' },
  { name: 'Taylor Morgan', email: 'tmorgan@eval.tasklytic', jobTitle: 'Senior Associate' },
  { name: 'Casey Nguyen', email: 'cnguyen@eval.tasklytic', jobTitle: 'Staff' },
  { name: 'Riley Park', email: 'rpark@eval.tasklytic', jobTitle: 'Analyst' },
  { name: 'Morgan Ellis', email: 'mellis@eval.tasklytic', jobTitle: 'Coordinator' },
  { name: 'Jamie Foster', email: 'jfoster@eval.tasklytic', jobTitle: 'Specialist' },
  { name: 'Quinn Hayes', email: 'qhayes@eval.tasklytic', jobTitle: 'Consultant' },
  { name: 'Avery Brooks', email: 'abrooks@eval.tasklytic', jobTitle: 'Associate' },
  { name: 'Drew Coleman', email: 'dcoleman@eval.tasklytic', jobTitle: 'Paralegal' },
  { name: 'Skyler Reed', email: 'sreed@eval.tasklytic', jobTitle: 'Controller' },
] as const

/** Build synthetic member specs distributed across team names. */
export function buildEvalMembers(
  teamNames: string[],
  count: number,
  role: 'member' | 'admin' = 'member'
) {
  return EVAL_PEOPLE.slice(0, count).map((p, i) => ({
    name: p.name,
    email: p.email.replace('@', `+${i}@`),
    role,
    jobTitle: p.jobTitle,
    teamNames: [teamNames[i % teamNames.length]],
  }))
}
