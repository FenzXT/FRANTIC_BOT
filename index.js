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
  ComponentType,
  ChannelType,
  MessageFlags
} = require('discord.js');
const fs = require('fs');

// --- WELCOME CONFIG ---
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

// --- TICKET CONFIG ---
let ticketConfig;
try {
  ticketConfig = require('./ticketConfig.json');
  // Ensure backward compatibility
  if (!('category' in ticketConfig)) ticketConfig.category = "";
} catch (err) {
  ticketConfig = { supportRole: "", category: "" };
  fs.writeFileSync('./ticketConfig.json', JSON.stringify(ticketConfig, null, 2));
}

let afkMap = {};
let userTemplates = {}; // Per-user server templates
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
  if (message.author.bot || !message.guild) return;

  // --- TICKET SYSTEM COMMANDS ---
  if (message.content.startsWith('!setticketrole') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply(
        'Usage: `!setticketrole @role`'
      );
    }
    ticketConfig.supportRole = role.id;
    fs.writeFileSync('./ticketConfig.json', JSON.stringify(ticketConfig, null, 2));
    return message.reply(`Support role set to ${role}`);
  }

  if (message.content.startsWith('!setticketcategory') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const args = message.content.split(' ');
    const categoryId = args[1];
    if (
      !categoryId ||
      !message.guild.channels.cache.has(categoryId) ||
      message.guild.channels.cache.get(categoryId).type !== ChannelType.GuildCategory
    ) {
      return message.reply(
        'Usage: `!setticketcategory [category-id]`\n' +
        'must provide a valid category ID (category > settings > copy id) Developer mode enabled.'
      );
    }
    ticketConfig.category = categoryId;
    fs.writeFileSync('./ticketConfig.json', JSON.stringify(ticketConfig, null, 2));
    return message.reply(`Ticket category set to <#${categoryId}>`);
  }

  if (message.content.startsWith('!createticket') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    if (!ticketConfig.supportRole) {
      return message.reply('must set a ticket role first using `!setticketrole @role`.');
    }
    if (!ticketConfig.category) {
      return message.reply('must set a ticket category first using `!setticketcategory [id]`.');
    }
    const regex = /!createticket\s+"([^"]+)"\s+"([^"]+)"\s+"(#[0-9A-Fa-f]{6})"/;
    const match = message.content.match(regex);
    if (!match) {
      return message.reply(
        'Usage: `!createticket "headline" "message" "#colorhex"`'
      );
    }
    const headline = match[1];
    const ticketMsg = match[2];
    const embedColor = match[3];

    const embed = new EmbedBuilder()
      .setTitle(headline)
      .setDescription(ticketMsg)
      .setColor(embedColor);

    const button = new ButtonBuilder()
      .setCustomId('create_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(button);

    await message.channel.send({ embeds: [embed], components: [row] });
    return;
  }

  // --- AFK SYSTEM ---
  if (message.content.startsWith('!afk')) {
    const reason = message.content.slice(5).trim() || "I'm AFK Don't Ping Me!.";
    afkMap[message.author.id] = { reason, timestamp: Date.now() };
    return message.reply(`You are now AFK: ${reason}`);
  }
  if (afkMap[message.author.id] && !message.content.startsWith('!afk')) {
    delete afkMap[message.author.id];
    message.reply("Welcome back! Your AFK status has been removed.");
  }
  if (message.mentions.users.size > 0) {
    message.mentions.users.forEach(user => {
      if (afkMap[user.id]) {
        message.channel.send({
          content: `**${user.tag}** is currently AFK: ${afkMap[user.id].reason}`
        });
      }
    });
  }

  // --- HELP COMMANDS ---
  if (message.content.startsWith('!help')) {
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

    const helpEmbedPage3 = new EmbedBuilder()
      .setTitle('BOT ALL COMMANDS - PAGE 3')
      .setColor('#7500ff')
      .setDescription('HERE ARE ALL AVAILABLE COMMANDS (PAGE 3):')
      .addFields(
        { 
          name: '!copy-server', 
          value: 'Copies the server structure - roles/channels, including Announcement, Stage, Forums (requires Administrator permission)' },
        { 
          name: '!paste-server', 
          value: 'Pastes the server structure - roles/channels, including Announcement, Stage, Forums (requires Administrator permission)' },
        { 
          name: '!afk [reason]', 
          value: 'Also sets your AFK status with an optional reason. Others will see it when they mention you.' },
        { 
          name: '!createticket "headline" "message" "#colorhex"',
          value: 'Creates a ticket panel with a button (requires Administrator permission)' },
        { 
          name: '!setticketrole @role',
          value: 'Sets the ticket role for inside tickets ping.' },
        { 
          name: '!setticketcategory [id]',
          value: 'Sets the category for ticket channels to be created, category > settings > copy id.' },
      )
      .setFooter({ text: 'FRANTIC BOT !HELP' });

    const page1Button = new ButtonBuilder()
      .setCustomId('help_page_1')
      .setLabel('Page 1')
      .setStyle(ButtonStyle.Secondary);

    const page2Button = new ButtonBuilder()
      .setCustomId('help_page_2')
      .setLabel('Page 2')
      .setStyle(ButtonStyle.Success);

    const page3Button = new ButtonBuilder()
      .setCustomId('help_page_3')
      .setLabel('Page 3')
      .setStyle(ButtonStyle.Primary);

    const rowPage1 = new ActionRowBuilder().addComponents(page2Button, page3Button);
    const rowPage2 = new ActionRowBuilder().addComponents(page1Button, page3Button);
    const rowPage3 = new ActionRowBuilder().addComponents(page1Button, page2Button);

    const helpMessage = await message.channel.send({ embeds: [helpEmbedPage1], components: [rowPage1] });

    const collector = helpMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== message.author.id) {
        try {
          await interaction.reply({ content: "only the user who used !help can use these buttons.", flags: MessageFlags.Ephemeral });
        } catch (error) {
          console.error("Failed to reply to interaction:", error);
        }
        return;
      }
      
      try {
        if (interaction.customId === 'help_page_2') {
          await interaction.update({ embeds: [helpEmbedPage2], components: [rowPage2] });
        } else if (interaction.customId === 'help_page_1') {
          await interaction.update({ embeds: [helpEmbedPage1], components: [rowPage1] });
        } else if (interaction.customId === 'help_page_3') {
          await interaction.update({ embeds: [helpEmbedPage3], components: [rowPage3] });
        }
      } catch (error) {
        console.error("Failed to update interaction:", error);
      }
    });

    collector.on('end', () => {
      const disabledRow = new ActionRowBuilder()
        .addComponents(page2Button.setDisabled(true), page3Button.setDisabled(true));
      helpMessage.edit({ components: [disabledRow] }).catch(() => {});
    });

    return;
  }

  // --- COPY SERVER (PER-USER) ---
  if (message.content === '!copy-server') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ Only admins can use this command.');
    }
    try {
      const roles = message.guild.roles.cache
        .filter(role => role.name !== '@everyone')
        .map(role => ({
          name: role.name,
          color: role.color,
          hoist: role.hoist,
          permissions: role.permissions.bitfield.toString(),
          mentionable: role.mentionable,
          position: role.position,
        }));

      const categories = message.guild.channels.cache
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map(cat => ({
          id: cat.id,
          name: cat.name,
          position: cat.rawPosition,
          channels: message.guild.channels.cache
            .filter(ch => ch.parentId === cat.id)
            .sort((a, b) => a.rawPosition - b.rawPosition)
            .map(ch => ({
              id: ch.id,
              name: ch.name,
              type: ch.type,
              topic: ch.topic || null,
              nsfw: ch.nsfw || false,
              bitrate: ch.bitrate || null,
              userLimit: ch.userLimit || null,
              rateLimitPerUser: ch.rateLimitPerUser || 0,
              position: ch.rawPosition,
              permissionOverwrites: ch.permissionOverwrites.cache.map(po => ({
                id: po.id,
                allow: po.allow.bitfield.toString(),
                deny: po.deny.bitfield.toString(),
                type: po.type,
              })),
              rtcRegion: ch.rtcRegion || null,
              videoQualityMode: ch.videoQualityMode || null,
            })),
        }));

      const template = { roles, categories };
      userTemplates[message.author.id] = template;
      fs.writeFileSync(`serverTemplate-${message.author.id}.json`, JSON.stringify(template, null, 2));
      message.reply('✅ Server structure copied! Use `!paste-server` in another server to paste.');
    } catch (err) {
      console.error(err);
      message.reply('❌ Failed to copy server structure.');
    }
    return;
  }

  // --- INTERACTIVE PASTE SERVER (PER-USER) ---
  if (message.content === '!paste-server') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ Only admins can use this command.');
    }
    // Try to load template from memory or file
    let template = userTemplates[message.author.id];
    if (!template && fs.existsSync(`serverTemplate-${message.author.id}.json`)) {
      template = JSON.parse(fs.readFileSync(`serverTemplate-${message.author.id}.json`));
      userTemplates[message.author.id] = template;
    }
    if (!template) {
      return message.reply('❌ No server template found for you. Use `!copy-server` first.');
    }
    pendingPaste[message.author.id] = { step: 'roles', deleteRoles: null, deleteChannels: null };
    return message.reply(
      "**Paste Options:**\n" +
      "1️⃣ Delete existing roles before pasting new ones\n" +
      "2️⃣ Keep existing roles\n" +
      "Reply with `1` or `2`."
    );
  }

  // --- INTERACTIVE PASTE STEPS (PER-USER) ---
  if (pendingPaste[message.author.id]) {
    const state = pendingPaste[message.author.id];
    const content = message.content.trim();

    if (state.step === 'roles' && (content === '1' || content === '2')) {
      state.deleteRoles = content === '1';
      state.step = 'channels';
      return message.reply(
        "**Next:**\n" +
        "1️⃣ Delete existing channels before pasting new ones\n" +
        "2️⃣ Keep existing channels\n" +
        "Reply with `1` or `2`."
      );
    }

    if (state.step === 'channels' && (content === '1' || content === '2')) {
      state.deleteChannels = content === '1';
      state.step = 'confirm';
      return message.reply(
        `**Ready to run!**\nDelete Roles: ${state.deleteRoles ? 'Yes' : 'No'}\nDelete Channels: ${state.deleteChannels ? 'Yes' : 'No'}\n` +
        "Type `run` to start the process."
      );
    }

    if (state.step === 'confirm' && content.toLowerCase() === 'run') {
      (async () => {
        try {
          // Load template for this user
          let template = userTemplates[message.author.id];
          if (!template && fs.existsSync(`serverTemplate-${message.author.id}.json`)) {
            template = JSON.parse(fs.readFileSync(`serverTemplate-${message.author.id}.json`));
            userTemplates[message.author.id] = template;
          }
          if (!template) {
            delete pendingPaste[message.author.id];
            return message.reply('❌ No server template found for you. Use `!copy-server` first.');
          }

          // 1. Delete roles if requested
          if (state.deleteRoles) {
            const rolesToDelete = message.guild.roles.cache
              .filter(role => role.name !== '@everyone' && !role.managed)
              .sort((a, b) => b.position - a.position);
            for (const role of rolesToDelete.values()) {
              try { await role.delete("Pasting server structure"); } catch (e) {}
            }
          }

          // 2. Recreate roles
          const sortedRoles = template.roles.sort((a, b) => b.position - a.position);
          const newRoles = {};
          for (const roleData of sortedRoles) {
            const newRole = await message.guild.roles.create({
              name: roleData.name,
              color: roleData.color,
              hoist: roleData.hoist,
              permissions: BigInt(roleData.permissions),
              mentionable: roleData.mentionable,
              reason: "Recreating server structure"
            });
            newRoles[roleData.name] = newRole;
          }

          // 3. Delete channels if requested
          if (state.deleteChannels) {
            for (const channel of message.guild.channels.cache.values()) {
              try { await channel.delete("Pasting server structure"); } catch {}
            }
          }

          // 4. Recreate categories
          const categoryMap = new Map();
          const sortedCategories = template.categories.sort((a, b) => a.position - b.position);
          for (const cat of sortedCategories) {
            try {
              const newCategory = await message.guild.channels.create({
                name: cat.name,
                type: ChannelType.GuildCategory,
                position: cat.position,
              });
              categoryMap.set(cat.id, newCategory);
            } catch (err) {
              console.error(`Failed to create category "${cat.name}":`, err);
            }
          }

          // 5. Recreate all channel types in categories
          const channelMap = new Map();
          for (const cat of template.categories) {
            const newCategory = categoryMap.get(cat.id);
            const sortedChans = cat.channels.sort((a, b) => a.position - b.position);
            for (const ch of sortedChans) {
              try {
                let newChannel;
                if (ch.type === ChannelType.GuildText) {
                  newChannel = await message.guild.channels.create({
                    name: ch.name,
                    type: ChannelType.GuildText,
                    parent: newCategory.id,
                    topic: ch.topic,
                    nsfw: ch.nsfw,
                    rateLimitPerUser: ch.rateLimitPerUser,
                    position: ch.position,
                    permissionOverwrites: ch.permissionOverwrites.map(po => ({
                      id: po.id,
                      allow: BigInt(po.allow),
                      deny: BigInt(po.deny),
                      type: po.type,
                    })),
                  });
                } else if (ch.type === ChannelType.GuildVoice) {
                  newChannel = await message.guild.channels.create({
                    name: ch.name,
                    type: ChannelType.GuildVoice,
                    parent: newCategory.id,
                    bitrate: ch.bitrate,
                    userLimit: ch.userLimit,
                    position: ch.position,
                    permissionOverwrites: ch.permissionOverwrites.map(po => ({
                      id: po.id,
                      allow: BigInt(po.allow),
                      deny: BigInt(po.deny),
                      type: po.type,
                    })),
                  });
                } else if (ch.type === ChannelType.GuildAnnouncement) {
                  newChannel = await message.guild.channels.create({
                    name: ch.name,
                    type: ChannelType.GuildAnnouncement,
                    parent: newCategory.id,
                    topic: ch.topic,
                    nsfw: ch.nsfw,
                    position: ch.position,
                    permissionOverwrites: ch.permissionOverwrites.map(po => ({
                      id: po.id,
                      allow: BigInt(po.allow),
                      deny: BigInt(po.deny),
                      type: po.type,
                    })),
                  });
                } else if (ch.type === ChannelType.GuildStageVoice) {
                  newChannel = await message.guild.channels.create({
                    name: ch.name,
                    type: ChannelType.GuildStageVoice,
                    parent: newCategory.id,
                    position: ch.position,
                    permissionOverwrites: ch.permissionOverwrites.map(po => ({
                      id: po.id,
                      allow: BigInt(po.allow),
                      deny: BigInt(po.deny),
                      type: po.type,
                    })),
                  });
                } else if (ch.type === ChannelType.GuildForum) {
                  newChannel = await message.guild.channels.create({
                    name: ch.name,
                    type: ChannelType.GuildForum,
                    parent: newCategory.id,
                    position: ch.position,
                    permissionOverwrites: ch.permissionOverwrites.map(po => ({
                      id: po.id,
                      allow: BigInt(po.allow),
                      deny: BigInt(po.deny),
                      type: po.type,
                    })),
                  });
                }
                if (newChannel) channelMap.set(ch.id, newChannel);
              } catch (err) {
                console.error(`Failed to create channel "${ch.name}":`, err);
              }
            }
          }

          // 6. Notify only in the command channel
          const completedMessage = '✅ **Server structure paste operation completed!**';
          if (message.channel && message.guild.channels.cache.has(message.channel.id)) {
            await message.channel.send(completedMessage);
          }

          // --- Forget the template for this user only ---
          delete userTemplates[message.author.id];
          if (fs.existsSync(`serverTemplate-${message.author.id}.json`)) {
            fs.unlinkSync(`serverTemplate-${message.author.id}.json`);
          }

          delete pendingPaste[message.author.id];
          if (message.channel && message.guild.channels.cache.has(message.channel.id)) {
            return message.reply('✅ Server structure pasted!');
          }
        } catch (err) {
          console.error(err);
          delete pendingPaste[message.author.id];
          if (message.channel && message.guild.channels.cache.has(message.channel.id)) {
            return message.reply('❌ Failed to paste server structure.');
          }
        }
      })();
    }
    return;
  }

  // --- MODERATION COMMANDS ---
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

  // --- WEBHOOK SENDER ---
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

  // --- WELCOME CONFIG ---
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

// --- TICKET SYSTEM INTERACTION HANDLER ---
client.on('interactionCreate', async interaction => {
  try {
    // --- Create Ticket Button ---
    if (interaction.isButton() && interaction.customId === 'create_ticket') {
      // Only one open ticket per user
      const existing = interaction.guild.channels.cache.find(c =>
        c.name === `ticket-${interaction.user.id}`
      );
      
      if (existing) {
        await interaction.reply({ 
          content: 'You already have an open ticket!', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      // Check if support role is set
      if (!ticketConfig.supportRole) {
        await interaction.reply({ 
          content: 'ticket role is not set, please set it with `!setticketrole @role`.', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      // Check if ticket category is set
      if (!ticketConfig.category) {
        await interaction.reply({ 
          content: 'ticket category is not set, please set it with `!setticketcategory [id]`.', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      // Defer the reply to give us more time to create the channel
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      try {
        // Create the ticket channel with explicit type for each overwrite
        const permissionOverwrites = [
          {
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
            type: 'role'
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ],
            type: 'member'
          },
          {
            id: ticketConfig.supportRole,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ],
            type: 'role'
          },
          // Allow all admins
          ...interaction.guild.roles.cache
            .filter(role => role.permissions.has(PermissionsBitField.Flags.Administrator))
            .map(role => ({
              id: role.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory
              ],
              type: 'role'
            }))
        ];

        const channel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.id}`,
          type: ChannelType.GuildText,
          parent: ticketConfig.category || undefined,
          permissionOverwrites
        });

        // Send greeting and delete button
        await channel.send({
          content: `<@&${ticketConfig.supportRole}> PINGED BY <@${interaction.user.id}>`,
          allowedMentions: { roles: [ticketConfig.supportRole] }
        });

        await channel.send('`CLICK THE BUTTON BELOW TO DELETE THIS TICKET CHANNEL WHEN YOUR ISSUE HAS BEEN RESOLVED.`');

        // Delete Ticket button
        const deleteButton = new ButtonBuilder()
          .setCustomId('delete_ticket')
          .setLabel('Delete Ticket')
          .setStyle(ButtonStyle.Danger);

        const deleteRow = new ActionRowBuilder().addComponents(deleteButton);

        await channel.send({
          content: '\u200B',
          components: [deleteRow]
        });

        await interaction.editReply({ 
          content: `Your ticket has been created: ${channel}`, 
          flags: MessageFlags.Ephemeral 
        });
      } catch (error) {
        console.error("Error creating ticket channel:", error);
        await interaction.editReply({ 
          content: "Failed to create ticket channel. Please try again later.", 
          flags: MessageFlags.Ephemeral 
        });
      }
      return;
    }

    // --- Delete Ticket Button ---
    if (interaction.isButton() && interaction.customId === 'delete_ticket') {
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
        const isSupport = ticketConfig.supportRole && member.roles.cache.has(ticketConfig.supportRole);
        const isCreator = interaction.channel.name === `ticket-${interaction.user.id}`;

        if (!(isAdmin || isSupport || isCreator)) {
          await interaction.reply({ 
            content: 'You do not have permission to delete this ticket.', 
            flags: MessageFlags.Ephemeral 
          });
          return;
        }

        await interaction.reply({ 
          content: 'Deleting the ticket...', 
          flags: MessageFlags.Ephemeral 
        });
        
        setTimeout(() => {
          interaction.channel.delete('Ticket closed').catch(err => {
            console.error("Failed to delete ticket channel:", err);
          });
        }, 1500);
      } catch (error) {
        console.error("Error handling delete ticket button:", error);
        if (!interaction.replied) {
          await interaction.reply({ 
            content: "An error occurred while processing your request.", 
            flags: MessageFlags.Ephemeral 
          });
        }
      }
      return;
    }

    // --- Help Page Buttons ---
    if (interaction.isButton() && interaction.customId.startsWith('help_page_')) {
      // These are handled in the messageCreate event
      return;
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
    
    // Try to respond if we haven't already
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ 
          content: "An error occurred while processing your request.", 
          flags: MessageFlags.Ephemeral 
        });
      } catch (err) {
        // Ignore further errors
      }
    }
  }
});

// --- WELCOME EVENT HANDLER ---
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

  const embed = new EmbedBuilder()
    .setTitle(`Welcome To The ${member.guild.name}!`)
    .setDescription(msg)
    .setColor(welcomeConfig.color)
    .setImage(welcomeConfig.image || null);

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('failed to send welcome message:', err);
  }
});

// Global error handler to prevent crashes
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

client.login(process.env.DISCORD_TOKEN);
