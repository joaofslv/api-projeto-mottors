process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';
require('tsx/cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { hash } = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { app } = require('../src/app.ts');
const { prisma } = require('../src/lib/prisma.ts');

test('login e autenticação HTTP (banco simulado)', async (t) => {
  const user = { id: 'user-test', email: 'joao@example.com', name: 'João', type: 'PERSON', phone: null, status: 'ACTIVE', deletedAt: null, password: await hash('senha-teste-123', 10) };
  let currentUser = user;
  let updates = 0;
  const original = { findUnique: prisma.user.findUnique, findFirst: prisma.user.findFirst, update: prisma.user.update };
  prisma.user.findUnique = async () => currentUser;
  prisma.user.findFirst = async () => currentUser?.status === 'ACTIVE' && !currentUser.deletedAt ? { id: currentUser.id, email: currentUser.email } : null;
  prisma.user.update = async () => { updates++; return user; };
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (password = 'senha-teste-123') => fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'JOAO@example.com', password }) });
  let token;
  try {
    await t.test('login gera JWT e atualiza último acesso', async () => {
      const response = await login();
      assert.equal(response.status, 200);
      const body = await response.json();
      token = body.data.access_token;
      const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'api-projeto-mottors', audience: 'mottors-api' });
      assert.equal(payload.sub, user.id);
      assert.equal(payload.exp - payload.iat, 3600);
      assert.equal(body.data.expires_in, 3600);
      assert.equal(JSON.stringify(body).includes(user.password), false);
      assert.equal(updates, 1);
    });
    await t.test('senha incorreta e email inexistente retornam o mesmo erro', async () => {
      const wrong = await login('senha-errada');
      assert.equal(wrong.status, 401);
      const body = await wrong.json();
      currentUser = null;
      const missing = await login();
      assert.equal(missing.status, 401);
      assert.deepEqual(await missing.json(), body);
    });
    await t.test('contas indisponíveis não fazem login', async () => {
      for (const patch of [{ status: 'BLOCKED' }, { status: 'PENDING' }, { deletedAt: new Date() }]) {
        currentUser = { ...user, ...patch };
        assert.equal((await login()).status, 401);
      }
      assert.equal(updates, 1);
      currentUser = user;
    });
    await t.test('valida corpo de login', async () => {
      const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 422);
    });
    await t.test('rota protegida aceita token válido', async () => {
      const response = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.id, user.id);
    });
    await t.test('rejeita token ausente, adulterado, expirado ou de algoritmo diferente', async () => {
      const options = { subject: user.id, issuer: 'api-projeto-mottors', audience: 'mottors-api' };
      const invalid = ['', `Bearer ${token}x`, `Basic ${token}`, `Bearer ${jwt.sign({}, process.env.JWT_SECRET, { ...options, expiresIn: -1 })}`, `Bearer ${jwt.sign({}, process.env.JWT_SECRET, { ...options, algorithm: 'HS384' })}`];
      for (const authorization of invalid) {
        assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: authorization } })).status, 401);
      }
    });
    await t.test('bloqueio após login invalida acesso à rota protegida', async () => {
      currentUser = { ...user, status: 'BLOCKED' };
      assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    });
  } finally {
    Object.assign(prisma.user, original);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
});
