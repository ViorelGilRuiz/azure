import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'tests',testMatch:'**/*.spec.ts',workers:1,
 use:{baseURL:process.env.AZURE_TEST_URL,channel:process.env.AZURE_PLAYWRIGHT_CHANNEL??'chrome'}
});

