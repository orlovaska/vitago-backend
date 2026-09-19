/**
 * Module boundary rules for the modular monolith. `npm run arch` fails CI on any violation.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Module dependencies go one way only; a cycle means a boundary is in the wrong place.',
      from: { path: '^src/' },
      to: { circular: true },
    },
    {
      name: 'module-public-api-only',
      severity: 'error',
      comment:
        'A module may use another module only through its index.ts. Tables, stores and services stay private.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'platform-knows-no-modules',
      severity: 'error',
      comment: 'Shared platform code must not depend on any business module.',
      from: { path: '^src/platform/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-test-code-in-src',
      severity: 'error',
      from: { path: '^src/', pathNot: '\\.(spec|test)\\.ts$' },
      to: { path: '^test/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
