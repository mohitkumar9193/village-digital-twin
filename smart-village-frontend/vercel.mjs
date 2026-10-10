import {deploymentConfig} from './deployment-config.js';
// Programmatic Vercel configuration; browser API calls stay same-origin.
export const config = deploymentConfig(process.env.BACKEND_ORIGIN);
