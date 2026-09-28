import { knip } from '@larrydarko/lint-config/knip';

export default knip({
    entry: ['src/**/*.d.ts!', 'scripts/**/*.ts!'],
    project: ['src/**/*.{ts,vue}!', 'scripts/**/*.ts!', 'tests/**/*.ts', 'eslint/*.js', '*.{ts,mts,js}'],
    tags: ['-public'],
});
