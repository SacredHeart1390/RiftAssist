// Display version is independent of the data/Control Center compatibility family.
const manifest=require('../app-release.json');
if(!/^0\.2\.\d+$/.test(manifest.version))throw Error('Invalid display patch version');
module.exports=Object.freeze({version:manifest.version,releaseFamily:'v0.2.0',releaseId:'v0.2.0',displayReleaseId:'v'+manifest.version});
