'use strict';
const path=require('node:path');
const {DATA_ROOT}=require('../src/paths');
const {observe}=require('../src/regional-ban-monitor.cjs');
observe({directory:path.join(DATA_ROOT,'regional-ban-observations')}).then(result=>{
  console.log(JSON.stringify(result));
  if(result.status==='review-required')process.exitCode=2;
}).catch(error=>{
  console.error(/^[a-z-]+$/.test(error.message)?error.message:'official-monitor-failed');
  process.exitCode=1;
});
