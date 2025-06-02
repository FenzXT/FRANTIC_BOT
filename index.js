require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  Partials,
  EmbedBuilder,
  WebhookClient,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const fs = require('fs');

// Load welcome config
let welcomeConfig;
try {
  welcomeConfig = require('./welcomeConfig.json');
} catch (err) {
  welcomeConfig = {
    channel: "",
    message: "Welcome <@user> to the server! You are member #{membercount}.",
    color: "#7500ff",
    image: "",
    enabled: false
  };
  fs.writeFileSync('./welcomeConfig.json', JSON.stringify(welcomeConfig, null, 2));
}

// Server copy/paste data
let serverData = {};
let pendingPaste = {};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  // Help Command (Paginated, 3 pages)
  if (message.content.startsWith('!help')) {
    // Page 1 embed
    const helpEmbedPage1 = new EmbedBuilder()
      .setTitle('BOT ALL COMMANDS - PAGE 1')
      .setColor('#7500ff')
      .setDescription('HERE ARE ALL AVAILABLE COMMANDS (PAGE 1):')
      .addFields(
        { name: '!kick @user', value: 'Kicks the mentioned user (requires KickMembers permission)' },
        { name: '!ban @user', value: 'Bans the mentioned user (requires BanMembers permission)' },
        { name: '!clear <number>', value: 'Deletes the specified number of messages (1-100, requires ManageMessages permission)' },
        { name: '!timeout @user <seconds>', value: 'Times out the user for the given seconds (requires ModerateMembers permission)' },
        { name: '!createwebhook <url> <color> <headline> <message>', value: 'Sends a message via webhook (requires ManageWebhooks permission)' }
      )
      .setFooter({ text: 'FRANTIC BOT !HELP' });

    // Page 2 embed
    const helpEmbedPage2 = new EmbedBuilder()
      .setTitle('BOT ALL COMMANDS - PAGE 2')
      .setColor('#7500ff')
      .setDescription('HERE ARE ALL AVAILABLE COMMANDS (PAGE 2):')
      .addFields(
        { name: '!setchannel #channel', value: 'Sets the channel for welcome messages (requires Administrator permission)' },
        { name: '!setwelcomemsg [message]', value: 'Sets the custom welcome message (use <@user>, {membercount}, {user_created}, {join_date})' },
        { name: '!setwelcomecolor [hex color]', value: 'Sets the embed color for welcome messages (use hex code)' },
        { name: '!setwelcomeimage [image url]', value: 'Sets the image URL for the welcome embed' },
        { name: '!help', value: 'Shows this help message' }
      )
      .setFooter({ text: 'FRANTIC BOT !HELP' });

    // Page 3 embed (NEW)
    const helpEmbedPage3 = new EmbedBuilder()
      .setTitle('BOT ALL COMMANDS - PAGE 3')
      .setColor('#7500ff')
      .setDescription('HERE ARE ALL AVAILABLE COMMANDS (PAGE 3):')
      .addFields(
        { 
          name: '!copy-server', 
          value: 'Copies the server structure (roles/channels) for admins\n' +
                 '**Usage:** `!copy-server`\n' +
                 '**Example:** `!copy-server`'
        },
        { 
          name: '!paste-server', 
          value: 'Pastes the server structure with options for admins\n' +
                 '**Usage:** `!paste-server`\n' +
                 '**Example:**\n' +
                 '`!paste-server`\n' +
                 'Bot: Select roles option: `1` = Delete, `2` = Do Not Delete\n' +
                 'You: `1`\n' +
                 'Bot: Select channels option: `1` = Delete, `2` = Do Not Delete\n' +
                 'You: `2`\n' +
                 'Bot: Type `run` to confirm and paste.'
        }
      )
      .setFooter({ text: 'FRANTIC BOT !HELP' });

    // Buttons
    const page1Button = new ButtonBuilder()
      .setCustomId('help_page_1')
      .setLabel('Page 1')
      .setStyle(ButtonStyle.Primary);

    const page2Button = new ButtonBuilder()
      .setCustomId('help_page_2')
      .setLabel('Page 2')
      .setStyle(ButtonStyle.Success);

    const page3Button = new ButtonBuilder()
      .setCustomId('help_page_3')
      .setLabel('Page 3')
      .setStyle(ButtonStyle.Secondary);

    // Initial row with Page 2 and Page 3 buttons
    const rowPage1 = new ActionRowBuilder().addComponents(page2Button, page3Button);
    // Row with Page 1 and Page 3 buttons
    const rowPage2 = new ActionRowBuilder().addComponents(page1Button, page3Button);
    // Row with Page 1 and Page 2 buttons
    const rowPage3 = new ActionRowBuilder().addComponents(page1Button, page2Button);

    // Send initial message with page 1 embed and Page 2/3 buttons
    const helpMessage = await message.channel.send({ embeds: [helpEmbedPage1], components: [rowPage1] });

    // Create a collector to listen for button interactions for 60 seconds
    const collector = helpMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on('collect', async interaction => {
      // Only the user who sent !help can use the buttons
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: "Only the user who used !help can use these buttons.", ephemeral: true });
      }

      if (interaction.customId === 'help_page_2') {
        await interaction.update({ embeds: [helpEmbedPage2], components: [rowPage2] });
      } else if (interaction.customId === 'help_page_1') {
        await interaction.update({ embeds: [helpEmbedPage1], components: [rowPage1] });
      } else if (interaction.customId === 'help_page_3') {
        await interaction.update({ embeds: [helpEmbedPage3], components: [rowPage3] });
      }
    });

    collector.on('end', () => {
      // Disable buttons after timeout
      const disabledRow = new ActionRowBuilder()
        .addComponents(page2Button.setDisabled(true), page3Button.setDisabled(true));
      helpMessage.edit({ components: [disabledRow] }).catch(() => {});
    });

    return;
  }

  // Kick Command
  if (message.content.startsWith('!kick')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply('You do not have permission to kick members.');
    }
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply(
        'Please mention a user to kick.\n' +
        '**Example:** `!kick @username`'
      );
    }
    try {
      await member.kick();
      message.channel.send(`${member.user.tag} was kicked.`);
    } catch (err) {
      message.channel.send('Failed to kick the user.');
    }
  }

  // Ban Command
  if (message.content.startsWith('!ban')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply('You do not have permission to ban members.');
    }
    const member = message.mentions.members.first();
    if (!member) {
      return message.reply(
        'Please mention a user to ban.\n' +
        '**Example:** `!ban @username`'
      );
    }
    try {
      await member.ban();
      message.channel.send(`${member.user.tag} was banned.`);
    } catch (err) {
      message.channel.send('Failed to ban the user.');
    }
  }

  // Clear Messages Command
  if (message.content.startsWith('!clear')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply('You do not have permission to clear messages.');
    }
    const args = message.content.split(' ');
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply(
        'Please specify a number of messages to delete (1-100).\n' +
        '**Example:** `!clear 10`'
      );
    }
    try {
      await message.channel.bulkDelete(amount, true);
      const reply = await message.channel.send(`Cleared ${amount} messages.`);
      setTimeout(() => reply.delete(), 3000);
    } catch (err) {
      message.channel.send('Failed to clear messages. (Can only delete messages younger than 14 days)');
    }
  }

  // Timeout Command
  if (message.content.startsWith('!timeout')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply('You do not have permission to timeout members.');
    }
    const member = message.mentions.members.first();
    const args = message.content.split(' ');
    const duration = parseInt(args[2]);
    if (!member || isNaN(duration) || duration < 1) {
      return message.reply(
        'Usage: !timeout @user <seconds>\n' +
        '**Example:** `!timeout @username 60`'
      );
    }
    try {
      await member.timeout(duration * 1000);
      message.channel.send(`${member.user.tag} has been timed out for ${duration} seconds.`);
    } catch (err) {
      message.channel.send('Failed to timeout the user. (I may not have permission or the user is above me)');
    }
  }

  // Webhook Send Command
  if (message.content.startsWith('!createwebhook')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageWebhooks)) {
      return message.reply('You do not have permission to use webhooks.');
    }
    const args = message.content.split(' ');
    const webhookUrl = args[1];
    const color = args[2] || '#7500ff';
    const headline = args[3] || 'Headline';
    const msg = args.slice(4).join(' ') || 'Hello from webhook!';

    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return message.reply(
        'Please provide a valid Discord webhook URL.\n' +
        '**Example:** `!createwebhook https://discord.com/api/webhooks/... #ff0000 Announcement Hello!`'
      );
    }

    try {
      const webhookClient = new WebhookClient({ url: webhookUrl });
      const embed = new EmbedBuilder()
        .setTitle(headline)
        .setDescription(msg)
        .setColor(color);
      await webhookClient.send({ embeds: [embed] });
      message.channel.send('Message sent via the provided webhook!');
    } catch (err) {
      console.error(err);
      message.channel.send('Failed to send message via the webhook. (Check the URL and permissions)');
    }
  }

  // --- COPY/PASTE SERVER STRUCTURE WITH SIMULATED MENUS ---
  if (message.content.toLowerCase() === '!copy-server') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You do not have permission to use this command.");
    }
    const guild = message.guild;
    const roles = guild.roles.cache
      .filter(role => role.name !== '@everyone')
      .map(role => ({
        name: role.name,
        color: role.color,
        permissions: role.permissions.bitfield
      }));
    const channels = guild.channels.cache.map(channel => ({
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId
    }));

    serverData[guild.id] = { roles, channels };
    return message.reply("Server structure copied! You can now use `!paste-server`.");
  }

  if (message.content.toLowerCase() === '!paste-server') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply("You do not have permission to use this command.");
    }
    if (!serverData[message.guild.id]) {
      return message.reply("No server data to paste. Use `!copy-server` first.");
    }

    pendingPaste[message.author.id] = {
      guildId: message.guild.id,
      step: 'deleteRoles',
      deleteRoles: null,
      deleteChannels: null
    };
    return message.reply(
      "**Select an option for roles:**\n" +
      "`1` - Delete Roles\n" +
      "`2` - Do Not Delete Roles\n" +
      "Reply with `1` or `2`."
    );
  }

  // Handle simulated menu replies for paste-server
  if (pendingPaste[message.author.id]) {
    const state = pendingPaste[message.author.id];
    const content = message.content.trim();

    if (state.step === 'deleteRoles' && (content === '1' || content === '2')) {
      state.deleteRoles = content === '1';
      state.step = 'deleteChannels';
      return message.reply(
        "**Select an option for channels:**\n" +
        "`1` - Delete Channels\n" +
        "`2` - Do Not Delete Channels\n" +
        "Reply with `1` or `2`."
      );
    }

    if (state.step === 'deleteChannels' && (content === '1' || content === '2')) {
      state.deleteChannels = content === '1';
      state.step = 'confirm';
      return message.reply(
        `**Ready to run!**\nDelete Roles: ${state.deleteRoles ? 'Yes' : 'No'}\nDelete Channels: ${state.deleteChannels ? 'Yes' : 'No'}\n` +
        "Type `run` to proceed."
      );
    }

    if (state.step === 'confirm' && content.toLowerCase() === 'run') {
      // Proceed to paste server structure
      const guild = message.guild;
      const data = serverData[guild.id];

      (async () => {
        if (state.deleteRoles) {
          for (const role of guild.roles.cache.values()) {
            if (role.name !== '@everyone' && !role.managed) {
              try { await role.delete("Pasting server structure"); } catch {}
            }
          }
        }
        if (state.deleteChannels) {
          for (const channel of guild.channels.cache.values()) {
            try { await channel.delete("Pasting server structure"); } catch {}
          }
        }
        for (const roleData of data.roles) {
          try {
            await guild.roles.create({
              name: roleData.name,
              color: roleData.color,
              permissions: BigInt(roleData.permissions)
            });
          } catch {}
        }
        for (const channelData of data.channels) {
          if (channelData.type === 0) {
            try {
              await guild.channels.create({
                name: channelData.name,
                type: channelData.type,
                parent: channelData.parentId
              });
            } catch {}
          }
        }
        delete pendingPaste[message.author.id];
        return message.reply("Server structure pasted!");
      })();
    }
  }

  // Welcome Channel Command
  if (message.content.startsWith('!setchannel') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply(
        'Please mention a channel to set as welcome channel.\n' +
        '**Example:** `!setchannel #welcome`'
      );
    }
    welcomeConfig.channel = channel.id;
    welcomeConfig.enabled = true;
    fs.writeFileSync('./welcomeConfig.json', JSON.stringify(welcomeConfig, null, 2));
    return message.reply(`Welcome channel set to ${channel}`);
  }

  // Set Welcome Message Command
  if (message.content.startsWith('!setwelcomemsg') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const newMsg = message.content.slice('!setwelcomemsg '.length);
    if (!newMsg) {
      return message.reply(
        'Please provide a welcome message.\n' +
        '**Example:** `!setwelcomemsg Hello <@user>! Welcome to our server!`'
      );
    }
    welcomeConfig.message = newMsg;
    fs.writeFileSync('./welcomeConfig.json', JSON.stringify(welcomeConfig, null, 2));
    return message.reply('Welcome message updated!');
  }

  // Set Welcome Color Command
  if (message.content.startsWith('!setwelcomecolor') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const color = message.content.split(' ')[1];
    if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return message.reply(
        'Please provide a valid hex color (e.g. #ff0000).\n' +
        '**Example:** `!setwelcomecolor #00ff00`'
      );
    }
    welcomeConfig.color = color;
    fs.writeFileSync('./welcomeConfig.json', JSON.stringify(welcomeConfig, null, 2));
    return message.reply(`Welcome color set to ${color}`);
  }

  // Set Welcome Image Command
  if (message.content.startsWith('!setwelcomeimage') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const url = message.content.split(' ')[1];
    if (!url || !url.startsWith('http')) {
      return message.reply(
        'Please provide a valid image URL.\n' +
        '**Example:** `!setwelcomeimage https://example.com/image.png`'
      );
    }
    welcomeConfig.image = url;
    fs.writeFileSync('./welcomeConfig.json', JSON.stringify(welcomeConfig, null, 2));
    return message.reply(`Welcome image set!`);
  }
});

// Welcome Event Handler
client.on('guildMemberAdd', async member => {
  if (!welcomeConfig.enabled || !welcomeConfig.channel) return;
  const channel = member.guild.channels.cache.get(welcomeConfig.channel);
  if (!channel) return;

  const joinDate = member.joinedAt.toLocaleDateString();
  const userCreated = member.user.createdAt.toLocaleDateString();
  const memberCount = member.guild.memberCount;

  let msg = welcomeConfig.message
    .replace('<@user>', `<@${member.id}>`)
    .replace('{membercount}', memberCount)
    .replace('{user_created}', userCreated)
    .replace('{join_date}', joinDate);

  // Hardcoded title as requested
  const embed = new EmbedBuilder()
    .setTitle(`Welcome To The ${member.guild.name}!`)
    .setDescription(msg)
    .setColor(welcomeConfig.color)
    .setImage(welcomeConfig.image || null);

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Failed to send welcome message:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
