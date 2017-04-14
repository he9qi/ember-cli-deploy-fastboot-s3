module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module'
  },
  extends: 'eslint:recommended',
  plugins: ['mocha'],
  env: {
    browser: true
  },
  rules: {
    'no-regex-spaces': 'off'
  }
};
