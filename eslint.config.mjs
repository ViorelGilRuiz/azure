import next from 'eslint-config-next/core-web-vitals';
const config = [{ignores:['.next/**','data/**','next-env.d.ts','.npm-cache/**','test-results/**','playwright-report/**']}, ...next];
export default config;
