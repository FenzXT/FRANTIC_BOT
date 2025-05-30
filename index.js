require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  PermissionsBitField, 
  Partials, 
  EmbedBuilder, 
  WebhookClient 
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
    color: "#00ff00",
    image: "",
    enabled: false
  };
  fs.writeFileSync('./welcomeConfig.json', JSON.stringify(welcomeConfig, null, 2));
}

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

  // Help Command
  if (message.content.startsWith('!help')) {
    const helpEmbed = new EmbedBuilder()
      .setTitle('Bot Commands Help')
      .setColor('#0099ff')
      .setDescription('Here are all available commands:')
      .addFields(
        { name: '!kick @user', value: 'Kicks the mentioned user (requires KickMembers permission)' },
        { name: '!ban @user', value: 'Bans the mentioned user (requires BanMembers permission)' },
        { name: '!clear <number>', value: 'Deletes the specified number of messages (1-100, requires ManageMessages permission)' },
        { name: '!timeout @user <seconds>', value: 'Times out the user for the given seconds (requires ModerateMembers permission)' },
        { name: '!createwebhook <url> <color> <headline> <message>', value: 'Sends a message via webhook (requires ManageWebhooks permission)' },
        { name: '!setchannel #channel', value: 'Sets the channel for welcome messages (requires Administrator permission)' },
        { name: '!setwelcomemsg [message]', value: 'Sets the custom welcome message (use <@user>, {membercount}, {user_created}, {join_date})' },
        { name: '!setwelcomecolor [hex color]', value: 'Sets the embed color for welcome messages (use hex code)' },
        { name: '!setwelcomeimage [image url]', value: 'Sets the image URL for the welcome embed' },
        { name: '!help', value: 'Shows this help message' }
      )
      .setFooter({ text: 'FRANTIC BOT !HELP' });
    return message.channel.send({ embeds: [helpEmbed] });
  }

  // Kick Command
  if (message.content.startsWith('!kick')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply('You do not have permission to kick members.');
    }
    const member = message.mentions.members.first();
    if (!member) return message.reply('Please mention a user to kick.');
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
    if (!member) return message.reply('Please mention a user to ban.');
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
      return message.reply('Please specify a number of messages to delete (1-100).');
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
      return message.reply('Usage: !timeout @user <seconds>');
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
    const color = args[2] || '#0099ff';
    const headline = args[3] || 'Headline';
    const msg = args.slice(4).join(' ') || 'Hello from webhook!';

    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return message.reply('Please provide a valid Discord webhook URL.\nExample: !createwebhook <url> <color> <headline> <message>');
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

  // Welcome Channel Command
  if (message.content.startsWith('!setchannel ') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const channel = message.mentions.channels.first();
    if (channel) {
      welcomeConfig.channel = channel.id;
      welcomeConfig.enabled = true;
      fs.writeFileSync('./welcomeConfig.json', JSON.stringify(welcomeConfig, null, 2));
      return message.reply(`Welcome channel set to ${channel}`);
    }
  }

  // Set Welcome Message Command
  if (message.content.startsWith('!setwelcomemsg ') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    welcomeConfig.message = message.content.slice('!setwelcomemsg '.length);
    fs.writeFileSync('./welcomeConfig.json', JSON.stringify(welcomeConfig, null, 2));
    return message.reply('Welcome message updated!');
  }

  // Set Welcome Color Command
  if (message.content.startsWith('!setwelcomecolor ') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const color = message.content.split(' ')[1];
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      welcomeConfig.color = color;
      fs.writeFileSync('./welcomeConfig.json', JSON.stringify(welcomeConfig, null, 2));
      return message.reply(`Welcome color set to ${color}`);
    }
  }

  // Set Welcome Image Command
  if (message.content.startsWith('!setwelcomeimage ') && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const url = message.content.split(' ')[1];
    if (url.startsWith('http')) {
      welcomeConfig.image = url;
      fs.writeFileSync('./welcomeConfig.json', JSON.stringify(welcomeConfig, null, 2));
      return message.reply(`Welcome image set!`);
    }
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
