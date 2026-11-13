// Display version is independent of the data/Control Center compatibility family.
const manifest=require('../app-release.json');
const version=manifest.displayVersion || manifest.version;
if(!/^0\.2\.\d+$/.test(version))throw Error('Invalid display patch version');
module.exports=Object.freeze({version,releaseFamily:'v0.2.0',releaseId:'v0.2.0',displayReleaseId:'v'+version});
