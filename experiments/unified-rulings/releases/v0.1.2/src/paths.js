const path = require('node:path');
const APP_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.resolve(process.env.RIFTASSI_DATA_ROOT || (path.basename(path.dirname(APP_ROOT)) === 'releases' ? path.join(APP_ROOT, '../..') : APP_ROOT));
module.exports = { APP_ROOT, DATA_ROOT };
