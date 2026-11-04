const path = require('node:path');
const APP_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.resolve(process.env.RIFTASSI_DATA_ROOT || path.join(APP_ROOT, '.dev-data'));
require('./environment').assertSafeLocation(DATA_ROOT);
module.exports = { APP_ROOT, DATA_ROOT };
