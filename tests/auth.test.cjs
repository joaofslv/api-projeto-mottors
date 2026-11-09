process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters';

require('tsx/cjs');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const { hash } = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { app } = require('../src/app.ts');
const { prisma } = require('../src/lib/prisma.ts');

const tokenHash = (token) =>
  createHash('sha256').update(token).digest('hex');

test('autenticação e sessões HTTP (banco simulado)', async (t) => {
  const user = {
    id: 'user-test',
    email: 'joao@example.com',
    name: 'João',
    type: 'PERSON',
    phone: null,
    status: 'ACTIVE',
    deletedAt: null,
    password: await hash('senha-teste-123', 10),
  };

  let currentUser = { ...user };
  let updates = 0;
  const sessions = new Map();

  const assignments = [];

function grantPermission({
  userId = user.id,
  active = true,
  deletedAt = null,
  permission = 'users.view',
} = {}) {
  const assignment = {
    userId,
    role: {
      active,
      deletedAt,
      permissions: [permission],
    },
  };

  assignments.push(assignment);
  return assignment;
}

  const originals = {
    roleFindMany: prisma.role.findMany,
    permissionFindMany: prisma.permission.findMany,
    transaction: prisma.$transaction,
    userFindUnique: prisma.user.findUnique,
    userUpdate: prisma.user.update,
    userRoleFindFirst: prisma.userRole.findFirst,
    sessionCreate: prisma.session.create,
    sessionFindUnique: prisma.session.findUnique,
    sessionFindFirst: prisma.session.findFirst,
    sessionUpdateMany: prisma.session.updateMany,
  };

  const accountActive = () =>
    currentUser &&
    currentUser.status === 'ACTIVE' &&
    !currentUser.deletedAt;

  function publicUser() {
    const { id, type, name, email, phone, status } = currentUser;
    return { id, type, name, email, phone, status };
  }

  function matches(session, where) {
    if (where.id !== undefined && session.id !== where.id) {
      return false;
    }

    if (
      where.userId !== undefined &&
      session.userId !== where.userId
    ) {
      return false;
    }

    if (
      where.refreshTokenHash !== undefined &&
      session.refreshTokenHash !== where.refreshTokenHash
    ) {
      return false;
    }

    if (where.revokedAt === null && session.revokedAt !== null) {
      return false;
    }

    if (
      where.expiresAt?.gt &&
      session.expiresAt <= where.expiresAt.gt
    ) {
      return false;
    }

    if (where.user && !accountActive()) {
      return false;
    }

    return true;
  }

  // Adia a execução, como as operações usadas em $transaction([...]).
  function deferred(operation) {
    return {
      then(resolve, reject) {
        return Promise.resolve()
          .then(operation)
          .then(resolve, reject);
      },
    };
  }

  prisma.user.findUnique = async ({ where }) => {
    if (!currentUser || currentUser.email !== where.email) {
      return null;
    }

    return { ...currentUser };
  };

  prisma.user.update = ({ data }) =>
    deferred(() => {
      updates++;
      Object.assign(currentUser, data);
      return { ...currentUser };
    });

  prisma.session.create = ({ data }) =>
    deferred(() => {
      const session = {
        ...data,
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      sessions.set(session.id, session);
      return { ...session };
    });

  prisma.session.findUnique = async ({ where }) => {
    const session = [...sessions.values()].find(
      (item) => matches(item, where),
    );

    if (!session) return null;

    return {
      ...session,
      user: currentUser ? { ...currentUser } : null,
    };
  };

  prisma.session.findFirst = async ({ where }) => {
    const session = [...sessions.values()].find(
      (item) => matches(item, where),
    );

    if (!session) return null;

    return {
      id: session.id,
      user: publicUser(),
    };
  };

  prisma.session.updateMany = async ({ where, data }) => {
    let count = 0;

    for (const session of sessions.values()) {
      if (matches(session, where)) {
        Object.assign(session, data);
        count++;
      }
    }

    return { count };
  };
prisma.userRole.findFirst = async ({ where }) => {
  const assignment = assignments.find((item) => {
    if (
      where.userId !== undefined &&
      item.userId !== where.userId
    ) {
      return false;
    }

    const roleFilter = where.role;

    if (
      roleFilter?.active !== undefined &&
      item.role.active !== roleFilter.active
    ) {
      return false;
    }

    if (
      roleFilter?.deletedAt === null &&
      item.role.deletedAt !== null
    ) {
      return false;
    }

    const permissionName =
      roleFilter?.permissions?.some?.permission?.name;

    if (
      permissionName !== undefined &&
      !item.role.permissions.includes(permissionName)
    ) {
      return false;
    }

    return true;
  });

  return assignment
    ? { userId: assignment.userId }
    : null;
};

  const listedPermission = {
    id: 'permission-test',
    name: 'roles.manage',
    resource: 'roles',
    action: 'manage',
  };

  prisma.role.findMany = async () => [
    {
      id: 'role-test',
      name: 'SUPER_ADMIN',
      description: 'Super Administrador',
      active: true,
      permissions: [
        {
          permission: {
            id: listedPermission.id,
            name: listedPermission.name,
          },
        },
      ],
    },
  ];

  prisma.permission.findMany = async () => [
    { ...listedPermission },
  ];

  // Simula as duas formas de chamada usadas pelo serviço.
  // Não reproduz o isolamento e o rollback reais do PostgreSQL.
  prisma.$transaction = async (operations) => {
    if (typeof operations === 'function') {
      return operations(prisma);
    }

    const results = [];

    for (const operation of operations) {
      results.push(await operation);
    }

    return results;
  };

  let server;

  try {
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const base = `http://127.0.0.1:${server.address().port}`;

    async function request(path, { body, token, method } = {}) {
      const headers = {};

      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      if (token !== undefined) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${base}${path}`, {
        method: method ?? (body !== undefined ? 'POST' : 'GET'),
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      return {
        status: response.status,
        body: await response.json(),
      };
    }

    const login = (password = 'senha-teste-123') =>
      request('/auth/login', {
        body: {
          email: 'JOAO@example.com',
          password,
        },
      });

    const refresh = (token) =>
      request('/auth/refresh', {
        body: { refresh_token: token },
      });

    async function newLogin() {
      const response = await login();
      assert.equal(response.status, 200);
      return response.body.data;
    }

    function sessionFor(accessToken) {
      const payload = jwt.verify(
        accessToken,
        process.env.JWT_SECRET,
        {
          algorithms: ['HS256'],
          issuer: 'api-projeto-mottors',
          audience: 'mottors-api',
        },
      );

      return sessions.get(payload.sid);
    }

    async function scenario(name, run) {
      await t.test(name, async () => {
        currentUser = { ...user };
        sessions.clear();
        assignments.length = 0;
        updates = 0;
        await run();
      });
    }

    await scenario('login cria sessão e retorna tokens', async () => {
      const tokens = await newLogin();

      const payload = jwt.verify(
        tokens.access_token,
        process.env.JWT_SECRET,
        {
          algorithms: ['HS256'],
          issuer: 'api-projeto-mottors',
          audience: 'mottors-api',
        },
      );

      assert.equal(payload.sub, user.id);
      assert.equal(payload.exp - payload.iat, 3600);
      assert.equal(tokens.expires_in, 3600);
      assert.equal(tokens.token_type, 'Bearer');
      assert.match(tokens.refresh_token, /^[a-f0-9]{64}$/);

      const session = sessions.get(payload.sid);

      assert.ok(session);
      assert.equal(session.userId, user.id);
      assert.equal(
        session.refreshTokenHash,
        tokenHash(tokens.refresh_token),
      );
      assert.notEqual(session.refreshTokenHash, tokens.refresh_token);
      assert.ok(session.expiresAt > new Date());
      assert.equal(session.revokedAt, null);
      assert.equal(updates, 1);

      assert.equal(
        JSON.stringify(tokens).includes(user.password),
        false,
      );
    });

    await scenario('senha errada e email inexistente', async () => {
      const wrong = await login('senha-errada');

      assert.equal(wrong.status, 401);

      currentUser = null;

      const missing = await login();

      assert.equal(missing.status, 401);
      assert.deepEqual(missing.body, wrong.body);
      assert.equal(sessions.size, 0);
      assert.equal(updates, 0);
    });

    await scenario('contas indisponíveis não criam sessão', async () => {
      for (const patch of [
        { status: 'BLOCKED' },
        { status: 'PENDING' },
        { deletedAt: new Date() },
      ]) {
        currentUser = { ...user, ...patch };

        assert.equal((await login()).status, 401);
      }

      assert.equal(sessions.size, 0);
      assert.equal(updates, 0);
    });

    await scenario('valida os corpos de login e refresh', async () => {
      for (const [path, body] of [
        ['/auth/login', {}],
        ['/auth/refresh', {}],
        ['/auth/refresh', { refresh_token: 'abc' }],
      ]) {
        const response = await request(path, { body });
        assert.equal(response.status, 422);
      }
    });

    await scenario('sessão ativa permite consultar usuário', async () => {
      const tokens = await newLogin();
      const response = await request('/auth/me', {
        token: tokens.access_token,
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.id, user.id);
      assert.equal('password' in response.body.data, false);
    });

    await scenario('rejeita JWT ausente ou inválido', async () => {
      const tokens = await newLogin();
      const session = sessionFor(tokens.access_token);

      const options = {
        subject: user.id,
        issuer: 'api-projeto-mottors',
        audience: 'mottors-api',
      };

      const invalidTokens = [
        undefined,
        'abc',
        `${tokens.access_token}x`,
        jwt.sign(
          { sid: session.id },
          process.env.JWT_SECRET,
          { ...options, expiresIn: -1 },
        ),
        jwt.sign(
          { sid: session.id },
          process.env.JWT_SECRET,
          { ...options, algorithm: 'HS384' },
        ),
        jwt.sign({}, process.env.JWT_SECRET, options),
        jwt.sign(
          { sid: session.id },
          process.env.JWT_SECRET,
          { ...options, subject: 'outro-usuario' },
        ),
      ];

      for (const token of invalidTokens) {
        const response = await request('/auth/me', { token });
        assert.equal(response.status, 401);
      }
    });

    await scenario('refresh troca tokens e mantém vencimento', async () => {
      const original = await newLogin();
      const session = sessionFor(original.access_token);
      const expiration = session.expiresAt.getTime();

      const response = await refresh(original.refresh_token);

      assert.equal(response.status, 200);

      const renewed = response.body.data;

      assert.notEqual(renewed.refresh_token, original.refresh_token);
      assert.equal(
        session.refreshTokenHash,
        tokenHash(renewed.refresh_token),
      );
      assert.equal(session.expiresAt.getTime(), expiration);
      assert.equal(sessions.size, 1);

      const me = await request('/auth/me', {
        token: renewed.access_token,
      });

      assert.equal(me.status, 200);
      assert.equal(
        (await refresh(original.refresh_token)).status,
        401,
      );
      assert.equal(
        (await refresh(renewed.refresh_token)).status,
        200,
      );
    });

    await scenario('refresh desconhecido retorna 401', async () => {
      assert.equal((await refresh('0'.repeat(64))).status, 401);
    });

    await scenario('sessão expirada bloqueia acesso e refresh', async () => {
      const tokens = await newLogin();
      const session = sessionFor(tokens.access_token);

      session.expiresAt = new Date(Date.now() - 1000);

      assert.equal(
        (await request('/auth/me', {
          token: tokens.access_token,
        })).status,
        401,
      );

      assert.equal(
        (await refresh(tokens.refresh_token)).status,
        401,
      );
    });

    await scenario('bloqueio do usuário invalida acesso e refresh', async () => {
      const tokens = await newLogin();

      currentUser.status = 'BLOCKED';

      assert.equal(
        (await request('/auth/me', {
          token: tokens.access_token,
        })).status,
        401,
      );

      assert.equal(
        (await refresh(tokens.refresh_token)).status,
        401,
      );
    });

    await scenario('logout revoga sessão e seus tokens', async () => {
      const tokens = await newLogin();

      const response = await request('/auth/logout', {
        method: 'POST',
        token: tokens.access_token,
      });

      assert.equal(response.status, 200);
      assert.ok(
        sessionFor(tokens.access_token).revokedAt instanceof Date,
      );

      assert.equal(
        (await request('/auth/me', {
          token: tokens.access_token,
        })).status,
        401,
      );

      assert.equal(
        (await refresh(tokens.refresh_token)).status,
        401,
      );
    });

    await scenario('logout preserva outras sessões', async () => {
      const first = await newLogin();
      const second = await newLogin();

      assert.equal(sessions.size, 2);

      const logout = await request('/auth/logout', {
        method: 'POST',
        token: first.access_token,
      });

      assert.equal(logout.status, 200);

      assert.equal(
        (await request('/auth/me', {
          token: second.access_token,
        })).status,
        200,
      );

      assert.equal(
        (await refresh(second.refresh_token)).status,
        200,
      );
    });
    await scenario('RBAC sem autenticação retorna 401', async () => {
  const response = await request('/auth/permission-check');

  assert.equal(response.status, 401);
});

await scenario('RBAC sem perfil retorna 403', async () => {
  const tokens = await newLogin();

  const response = await request('/auth/permission-check', {
    token: tokens.access_token,
  });

  assert.equal(response.status, 403);
});

await scenario('RBAC com permissão retorna 200', async () => {
  grantPermission();

  const tokens = await newLogin();

  const response = await request('/auth/permission-check', {
    token: tokens.access_token,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
});

await scenario('RBAC ignora perfil desativado ou removido', async () => {
  const tokens = await newLogin();

  for (const options of [
    { active: false },
    { deletedAt: new Date() },
  ]) {
    assignments.length = 0;
    grantPermission(options);

    const response = await request('/auth/permission-check', {
      token: tokens.access_token,
    });

    assert.equal(response.status, 403);
  }
});

await scenario('RBAC exige a permissão específica', async () => {
  grantPermission({ permission: 'billing.view' });

  const tokens = await newLogin();

  const response = await request('/auth/permission-check', {
    token: tokens.access_token,
  });

  assert.equal(response.status, 403);
});

await scenario('RBAC não usa o perfil de outro usuário', async () => {
  grantPermission({ userId: 'outro-usuario' });

  const tokens = await newLogin();

  const response = await request('/auth/permission-check', {
    token: tokens.access_token,
  });

  assert.equal(response.status, 403);
});

await scenario('RBAC reflete a retirada de permissão sem novo login', async () => {
  const assignment = grantPermission();
  const tokens = await newLogin();

  const before = await request('/auth/permission-check', {
    token: tokens.access_token,
  });

  assert.equal(before.status, 200);

  assignment.role.permissions.length = 0;

  const after = await request('/auth/permission-check', {
    token: tokens.access_token,
  });

  assert.equal(after.status, 403);
});
    for (const path of ['/roles', '/permissions']) {
      await scenario(`${path}: sem token retorna 401`, async () => {
        const response = await request(path);
        assert.equal(response.status, 401);
      });

      await scenario(`${path}: sem permissão retorna 403`, async () => {
        const tokens = await newLogin();
        const response = await request(path, {
          token: tokens.access_token,
        });
        assert.equal(response.status, 403);
      });

      await scenario(`${path}: users.view não permite acesso`, async () => {
        grantPermission({ permission: 'users.view' });
        const tokens = await newLogin();
        const response = await request(path, {
          token: tokens.access_token,
        });
        assert.equal(response.status, 403);
      });

      await scenario(`${path}: roles.manage permite listar`, async () => {
        grantPermission({ permission: 'roles.manage' });
        const tokens = await newLogin();
        const response = await request(path, {
          token: tokens.access_token,
        });

        assert.equal(response.status, 200);
        assert.equal(response.body.success, true);

        if (path === '/roles') {
          assert.deepEqual(response.body.data, [
            {
              id: 'role-test',
              name: 'SUPER_ADMIN',
              description: 'Super Administrador',
              active: true,
              permissions: [
                {
                  id: 'permission-test',
                  name: 'roles.manage',
                },
              ],
            },
          ]);
        } else {
          assert.deepEqual(response.body.data, [
            {
              id: 'permission-test',
              name: 'roles.manage',
              resource: 'roles',
              action: 'manage',
            },
          ]);
        }
      });
    }
  } finally {
    prisma.role.findMany = originals.roleFindMany;
    prisma.permission.findMany = originals.permissionFindMany;
    prisma.$transaction = originals.transaction;
    prisma.user.findUnique = originals.userFindUnique;
    prisma.user.update = originals.userUpdate;
    prisma.session.create = originals.sessionCreate;
    prisma.session.findUnique = originals.sessionFindUnique;
    prisma.session.findFirst = originals.sessionFindFirst;
    prisma.session.updateMany = originals.sessionUpdateMany;
    prisma.userRole.findFirst = originals.userRoleFindFirst;

    if (server?.listening) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }

    await prisma.$disconnect();
  }
});