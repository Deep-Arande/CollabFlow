/**
 * API flow smoke test — exercises the REAL HTTP endpoints end-to-end.
 *
 * Unlike prisma/seed.ts (which writes straight to the DB), this drives the running
 * Express server over HTTP, so it verifies auth, validation, RBAC middleware,
 * the invite state machine, comments/@mentions, and the AI endpoints actually behave.
 *
 * Minimal data: 2 users, 1 project, 1 task, 1 comment — the project is deleted at the end.
 * Users are reused across runs (register, or log in if they already exist), so nothing accumulates.
 *
 * Prereq: the server must be running (npm run dev).
 * Run:    npm run test:api
 * Config: API_URL (default http://localhost:5000/api)
 *
 * Exit code 0 = all checks passed, 1 = something failed.
 */

const API = process.env.API_URL || 'http://localhost:5000/api';
const ORIGIN = API.replace(/\/api\/?$/, '');

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  → ${detail}` : ''}`); }
};

interface Res { status: number; body: any }
async function req(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<Res> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

// Register a user, or log in if that email already exists (keeps the test repeatable).
async function registerOrLogin(name: string, email: string, password: string): Promise<{ id: string; token: string }> {
  const r = await req('POST', '/auth/register', { body: { name, email, password } });
  if (r.status === 201) return { id: r.body.data.user.id, token: r.body.data.token };
  if (r.status === 409) {
    const l = await req('POST', '/auth/login', { body: { email, password } });
    if (l.status === 200) return { id: l.body.data.user.id, token: l.body.data.token };
    throw new Error(`login failed for ${email}: ${l.status} ${JSON.stringify(l.body)}`);
  }
  throw new Error(`register failed for ${email}: ${r.status} ${JSON.stringify(r.body)}`);
}

async function preflight() {
  try {
    const res = await fetch(`${ORIGIN}/health`);
    if (!res.ok) throw new Error(`health returned ${res.status}`);
  } catch (e) {
    console.error(`\n✗ Cannot reach the server at ${ORIGIN}. Is it running? (cd server && npm run dev)\n`);
    throw e;
  }
}

async function main() {
  console.log(`API flow test → ${API}\n`);
  await preflight();

  const ts = Date.now();
  // Fixed-ish emails so users are reused, not accumulated, across runs.
  // Deliberately distinct from the demo seed (different domain + "APITest" names) to avoid confusion.
  const A = await registerOrLogin('APITest Lead', 'apitest.lead@apitest.dev', 'FlowTest123!');
  const B = await registerOrLogin('APITest Member', 'apitest.member@apitest.dev', 'FlowTest123!');
  const C = await registerOrLogin('APITest Outsider', 'apitest.outsider@apitest.dev', 'FlowTest123!');
  console.log('Auth:');
  check('register/login user A (lead)', !!A.token);
  check('register/login user B (member)', !!B.token);
  check('register/login user C (outsider)', !!C.token);

  let projectId = '';
  let taskId = '';
  try {
    // ---- Project create (A becomes LEAD) ----
    console.log('\nProject + membership:');
    const dueDate = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const pc = await req('POST', '/projects', { token: A.token, body: { name: `Flow Test ${ts}`, description: 'API smoke test', dueDate } });
    check('A creates project (201)', pc.status === 201, `got ${pc.status}`);
    projectId = pc.body?.data?.project?.id ?? pc.body?.data?.id;
    check('project id returned', !!projectId);

    // ---- Negative RBAC: outsider C cannot read the project ----
    const cRead = await req('GET', `/projects/${projectId}`, { token: C.token });
    check('outsider C GET project → 403', cRead.status === 403, `got ${cRead.status}`);

    // ---- Invite B, B still can't see it until accepted ----
    const inv = await req('POST', `/projects/${projectId}/members`, { token: A.token, body: { userId: B.id, role: 'MEMBER' } });
    check('A invites B (201)', inv.status === 201, `got ${inv.status}`);
    const membershipId = inv.body?.data?.member?.id;

    const bReadPending = await req('GET', `/projects/${projectId}`, { token: B.token });
    check('B (pending) GET project → 403', bReadPending.status === 403, `got ${bReadPending.status}`);

    const pend = await req('GET', '/invites/pending', { token: B.token });
    check('B sees pending invite', Array.isArray(pend.body?.data?.invites) && pend.body.data.invites.some((i: any) => i.projectId === projectId));

    const acc = await req('PATCH', `/invites/${membershipId}/respond`, { token: B.token, body: { response: 'ACCEPTED' } });
    check('B accepts invite (200)', acc.status === 200, `got ${acc.status}`);

    const bReadNow = await req('GET', `/projects/${projectId}`, { token: B.token });
    check('B (accepted) GET project → 200', bReadNow.status === 200, `got ${bReadNow.status}`);

    // ---- Task create by A, assigned to B ----
    console.log('\nTasks + RBAC:');
    const tc = await req('POST', `/projects/${projectId}/tasks`, { token: A.token, body: { title: 'Flow task', priority: 'HIGH', assignedTo: B.id } });
    check('A creates task assigned to B (201)', tc.status === 201, `got ${tc.status}`);
    taskId = tc.body?.data?.task?.id ?? tc.body?.data?.id;
    check('task id returned', !!taskId);

    // Negative: B cannot create a task (member, not lead)
    const bCreate = await req('POST', `/projects/${projectId}/tasks`, { token: B.token, body: { title: 'nope' } });
    check('B (member) create task → 403', bCreate.status === 403, `got ${bCreate.status}`);

    // B updates status of the task assigned to them
    const bStatus = await req('PATCH', `/projects/${projectId}/tasks/${taskId}/status`, { token: B.token, body: { status: 'IN_PROGRESS' } });
    check('B updates own task status (200)', bStatus.status === 200, `got ${bStatus.status}`);

    // ---- Comment with @mention of A ----
    console.log('\nComments + mentions:');
    const cm = await req('POST', `/tasks/${taskId}/comments`, { token: B.token, body: { content: 'Working on it @APITestLead' } });
    check('B comments with @mention (201)', cm.status === 201, `got ${cm.status}`);
    const mentionCount = cm.body?.data?.comment?.mentions?.length ?? cm.body?.data?.mentions?.length ?? 0;
    check('mention parsed (A mentioned)', mentionCount >= 1, `mentions=${mentionCount}`);

    const mine = await req('GET', '/mentions/me', { token: A.token });
    check('A sees the mention in inbox', Array.isArray(mine.body?.data?.mentions) && mine.body.data.mentions.length >= 1);

    // ---- AI endpoints (tolerant of 503 when GEMINI_API_KEY is unset) ----
    console.log('\nAI endpoints:');
    const cmu = await req('GET', `/projects/${projectId}/catch-me-up`, { token: A.token });
    if (cmu.status === 503) check('catch-me-up (skipped: no GEMINI_API_KEY)', true);
    else check('catch-me-up returns summary (200)', cmu.status === 200 && typeof cmu.body?.data?.summary === 'string', `got ${cmu.status}`);

    // outsider C blocked from AI even by projectId
    const cCmu = await req('GET', `/projects/${projectId}/catch-me-up`, { token: C.token });
    check('outsider C catch-me-up → 403', cCmu.status === 403, `got ${cCmu.status}`);

    const asst = await req('POST', `/projects/${projectId}/assistant`, { token: A.token, body: { question: 'What is the status of the flow task?' } });
    if (asst.status === 503) check('assistant (skipped: no GEMINI_API_KEY)', true);
    else check('assistant returns answer (200)', asst.status === 200 && typeof asst.body?.data?.answer === 'string', `got ${asst.status}`);

    const cAsst = await req('POST', `/projects/${projectId}/assistant`, { token: C.token, body: { question: 'leak?' } });
    check('outsider C assistant → 403', cAsst.status === 403, `got ${cAsst.status}`);
  } finally {
    // ---- Cleanup: delete the project (cascades tasks/comments/members) ----
    if (projectId) {
      const del = await req('DELETE', `/projects/${projectId}`, { token: A.token });
      console.log('\nCleanup:');
      check('A deletes project (200)', del.status === 200, `got ${del.status}`);
    }
  }

  console.log(`\n${'─'.repeat(40)}\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFatal:', e.message);
  process.exit(1);
});
