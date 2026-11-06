// Conventional Commits: feat, fix, docs, refactor, test, chore, ci, perf, build, style, revert
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'body-max-line-length': [1, 'always', 120],
  },
};
