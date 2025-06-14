const RPC = require('discord-rpc');
const clientId = '1377617477160144957'; // Your Discord BOT Client ID

RPC.register(clientId);

const rpc = new RPC.Client({ transport: 'ipc' });

rpc.on('ready', () => {
  rpc.setActivity({
    state: 'MULTI-FEATURE BOT',
    startTimestamp: new Date(),
    largeImageKey: 'frantic', // Image asset name (add image)
    buttons: [
      {
        label: 'CLICK TO ADD',
        url: 'https://discord.com/oauth2/authorize?client_id=1377617477160144957&permissions=8&integration_type=0&scope=bot+applications.commands'
      }
    ]
  });

  console.log('✅ Rich Presence is active.');
});

rpc.login({ clientId }).catch(console.error);
