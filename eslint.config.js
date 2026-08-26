// Configuración de ESLint (formato plano, ESLint 9).
//
// El proyecto no tenía linter. Se agrega porque el pipeline necesita una etapa
// que atrape la clase de error que ni las pruebas ni el navegador ven a tiempo:
// una variable mal escrita, un `await` olvidado, un catch sin usar. La regla que
// más gana acá es `require-atomic-updates`... y sobre todo `no-undef`, que en
// JavaScript sin tipos es lo único que separa `hoyISO()` de `hoyIS0()`.
//
// El criterio es deliberadamente sobrio: las reglas recomendadas y unas pocas
// más que apuntan a defectos reales. Nada de estilo. Este repositorio ya tiene
// una convención de formato consistente y un linter de estilo solo generaría
// ruido en un diff que se lee como el relato del trabajo.

'use strict';

const js = require('@eslint/js');

const globalesDeNode = {
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  process: 'readonly',
  console: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
};

module.exports = [
  {
    ignores: ['node_modules/**', 'reservas.db', '.vercel/**', 'docs/**'],
  },

  // El sistema, los scripts y las herramientas: CommonJS sobre Node.
  {
    files: ['**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: globalesDeNode,
    },
    rules: {
      ...js.configs.recommended.rules,

      // Defectos, no estilo.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-return-await': 'error',
      'require-atomic-updates': 'error',

      // Una promesa sin await dentro de un handler asíncrono es exactamente el
      // error que la migración a libSQL vuelve posible: antes toda consulta
      // devolvía el dato, ahora devuelve una promesa. Si alguien olvida el
      // await, el HTML sale con "[object Promise]" adentro.
      'no-async-promise-executor': 'error',

      // Un catch que no hace nada tiene que decir por qué. Los de este
      // repositorio lo dicen (Windows retiene el handle del archivo).
      'no-empty': ['error', { allowEmptyCatch: false }],

      // Los require() dentro de una función son deliberados en bd.js: el import
      // de @libsql/client se elige según la clase de base, para que la función
      // serverless no cargue el binding nativo.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'all' }],
    },
  },

  // Las pruebas usan los globales de node:test.
  {
    files: ['pruebas/**/*.js'],
    languageOptions: {
      globals: { ...globalesDeNode },
    },
  },
];
