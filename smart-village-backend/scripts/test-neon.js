import {spawn} from 'node:child_process';
const run=spawn(process.execPath,['--test','--test-concurrency=1','test/api.test.js','test/serverless.test.js','test/local-ai.test.js'],{stdio:'inherit',env:{...process.env,PG_TEST:'true'},windowsHide:true});
run.on('exit',code=>process.exitCode=code??1);
