'use strict';
// Generates text only. No installation, daemon reload, permissions or server connection.
const P=require('./protocol.cjs');
function systemdUnits(config,tools='/usr/local/lib/riftassist-stage/staging') {
  const common='\n[Service]\nType=simple\nUser='+config.appUid+'\nGroup='+config.appGid+'\nRestart=on-failure\nRestartSec=5\nTimeoutStartSec=45\nTimeoutStopSec=115\nKillMode=control-group\nNoNewPrivileges=yes\nPrivateTmp=yes\nProtectHome=yes\nProtectSystem=strict\nProtectKernelTunables=yes\nProtectKernelModules=yes\nProtectControlGroups=yes\nRestrictSUIDSGID=yes\nRestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK\nIPAddressDeny=any\nIPAddressAllow=localhost\nUMask=0077\nUnsetEnvironment=OPENAI_API_KEY RIOT_API_KEY NODE_OPTIONS NODE_PATH LD_PRELOAD SSH_AUTH_SOCK\n';
  const units={};
  for(const slot of ['a','b'])units[P.unit(config,slot)]='[Unit]\nDescription=RiftAssist isolated staging '+slot+'\nStartLimitIntervalSec=120\nStartLimitBurst=3\nConditionPathExists='+P.within(config.root,'launch',slot+'.json')+common+
    'WorkingDirectory='+P.within(config.root,'data',slot)+'\nExecStart='+config.node+' --require '+tools+'/mock-legacy.cjs '+tools+'/runner.cjs '+P.within(config.root,'launch',slot+'.json')+'\nReadWritePaths='+P.within(config.root,'data',slot)+'\nReadOnlyPaths='+P.within(config.root,'data',slot,'releases')+' '+P.within(config.root,'data',slot,'knowledge-releases')+'\n';
  units[P.unit(config,'proxy')]='[Unit]\nDescription=RiftAssist isolated staging HTTPS proxy\nStartLimitIntervalSec=120\nStartLimitBurst=3'+common+
    'WorkingDirectory='+P.within(config.root,'proxy')+'\nEnvironment=XDG_DATA_HOME='+P.within(config.root,'proxy','data')+' XDG_CONFIG_HOME='+P.within(config.root,'proxy','config')+'\nExecStart='+config.caddy+' run --config '+P.within(config.root,'proxy','Caddyfile')+' --adapter caddyfile\nExecReload='+config.caddy+' reload --config '+P.within(config.root,'proxy','Caddyfile')+' --adapter caddyfile --address 127.0.0.1:'+config.proxyAdminPort+'\nReadWritePaths='+P.within(config.root,'proxy','data')+' '+P.within(config.root,'proxy','config')+'\n';
  return units;
}
const wrapper='#!/bin/sh\nset -eu\n[ "$#" -eq 0 ] || exit 64\nexec /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw /usr/local/lib/riftassist-stage/staging/serve.cjs\n';
module.exports={systemdUnits,wrapper};
