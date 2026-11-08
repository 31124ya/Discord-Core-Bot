require('dotenv').config();
const fs = require('fs');
// ========== AI Configuration ==========
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AI_CHANNEL_ID = process.env.AI_CHANNEL_ID;
const KNOWLEDGE = fs.readFileSync('./knowledge.txt', 'utf-8');
const MODEL = process.env.MODEL;
// ========== VR Status ==========
const { DefaultWebSocketManagerOptions } = require('@discordjs/ws');
DefaultWebSocketManagerOptions.identifyProperties = {
  os: 'android',
  browser: 'Discord VR',
  device: 'Discord VR',
};
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelSelectMenuBuilder,
  ChannelType
} = require('discord.js');
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});
const announcementSessions = new Map();
client.on('error', error => {
  console.error('Discord Client Error:', error);
});
// Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Displays the current membercount of Fiji Airways'),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Sending announcements using Components V2')
    .addSubcommand(sub =>
      sub
        .setName('announcement')
        .setDescription('Create a Components V2 announcement')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());
async function registerCommands() {
  if (!TOKEN || !CLIENT_ID) return;
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Commands registered.');
  } catch (error) {
    console.error(error);
  }
}
// =============================
// Components V2 Builders
// =============================
function buildMemberCountPayload(guild, user = null) {
  const now = Math.floor(Date.now() / 1000);
  return {
    flags: 32768,
    embeds: [],
    components: [
      {
        type: 17,
        accent_color: 0x443325,
        components: [
          { type: 10, content: "### <:group:1520366058978938930> Total members:" },
          {
            type: 10,
            content: `# ${guild.memberCount}\nLast updated at <t:${now}:f>` +
              (user ? ` (Refreshed by ${user})` : '')
          },
          { type: 14, spacing: 1, divider: true },
          {
            type: 1,
            components: [
              { type: 2, style: 2, label: "Refresh Total", custom_id: "refresh_member_count" }
            ]
          }
        ]
      }
    ]
  };
}
function buildPingPayload(wsPing, latency, user = null) {
  const now = Math.floor(Date.now() / 1000);
  return {
    flags: 32768,
    embeds: [],
    components: [
      {
        type: 17,
        accent_color: 0x443325,
        components: [
          { type: 10, content: "### 🏓 Pong!" },
          {
            type: 10,
            content: `**WebSocket Latency:** \`${wsPing}\`\n` +
              `**API Roundtrip:** \`${latency} ms\`` +
              (user ? `\n\nLast updated at <t:${now}:f> (Refreshed by ${user})` : '')
          },
          { type: 14, spacing: 1, divider: true },
          {
            type: 1,
            components: [
              { type: 2, style: 2, label: "Refresh Ping", custom_id: "refresh_ping" }
            ]
          }
        ]
      }
    ]
  };
}
function buildWelcomePayload(member) {
  return {
    flags: 32768,
    embeds: [],
    components: [
      {
        type: 17,
        accent_color: 0x443325,
        components: [
          {
            type: 10,
            content: `### <:fjtail:1510932400048439326> Welcome to Fiji Airways, <@${member.id}>!`
          },
          {
            type: 10,
            content: `Thank you for joining **__<:fjtail:1510932400048439326> Fiji Airways__**!\n\nWelcome to our <#1427921698555957378>.`
          }
        ]
      }
    ]
  };
}
function buildAnnouncementPanel() {
  return {
    flags: 32768,
    embeds: [],
    components: [
      {
        type: 17,
        accent_color: 0x443325,
        components: [
          { type: 10, content: "### Announcement Creator" },
          {
            type: 10,
            content: "Create custom Components V2 announcements.\n\n" +
              "-# Made by 31124ya\n" +
              "Features:\n" +
              "• Select channel\n" +
              "• JSON editor\n" +
              "• Advanced announcements"
          },
          {
            type: 1,
            components: [
              { type: 2, style: 1, label: "Create Announcement", custom_id: "create_announcement" }
            ]
          }
        ]
      }
    ]
  };
}
function getFormattedWsPing() {
  return client.ws.ping < 0 ? "Connecting..." : `${client.ws.ping} ms`;
}
// =============================
// Ready Event
// =============================
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setPresence({ status: 'online' });
  registerCommands();
});
// =============================
// Welcome Event
// =============================
client.on('guildMemberAdd', async member => {
  try {
    const channel =
      member.guild.channels.cache.get(WELCOME_CHANNEL_ID) ||
      await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (!channel) return;
    await channel.send(buildWelcomePayload(member));
  } catch (error) {
    console.error('Welcome error:', error);
  }
});
// =============================
// AI Auto Reply
// =============================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== AI_CHANNEL_ID) return;
  const question = message.content.trim();
  if (!question) return;
  await message.channel.sendTyping();
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://discord.com',
        'X-Title': 'Discord Bot'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
    		role: 'system',
    		content: `You are the AI Assistant for Fiji Airways, a Roblox-based virtual airline. Your primary responsibility is to assist users by answering their questions using only the knowledge base provided below. Never fabricate information or use external knowledge to answer Fiji Airways-related questions.

If a question cannot be answered using the available knowledge base, or if it involves a complex topic outside your permitted scope, politely explain that you are unable to assist with the specific inquiry. If further assistance is required, direct the user to the human support team in the designated support channel. You may phrase your responses naturally and creatively, provided that the original meaning remains unchanged.

CRITICAL DISCORD MENTION SAFETY RULE: You must never generate content that can trigger a Discord notification to any user, role, or group. Never output active Discord mention syntax, including mass mentions, user mentions, role mentions, or raw Discord mention IDs in a format that could trigger notifications.

This restriction applies even when refusing a request, explaining that you cannot ping anyone, quoting a message, giving an example, discussing Discord mentions, or apologizing for an accidental ping.

NEVER include the actual mass-mention syntax in a sentence explaining that you cannot use it. For example, never write a sentence such as "I am not able to ping [actual mass-mention syntax]" with the real mention inserted. Instead, say "I am not able to send mass notifications." When discussing restricted mentions, use descriptive phrases such as "the everyone mention", "the here mention", or "mass pings" instead of writing their actual syntax.

Do not assume that a mention is safe because it appears in a sentence, quotation, Markdown formatting, a code block, or a refusal. Never reproduce active mention syntax simply to explain why it is prohibited. Do not construct channel mentions either. When directing users to support, refer to the support channel by its plain-text name or provide its channel ID as ordinary text without mention syntax.

Before finalizing every response, check the entire output for any text that could trigger a Discord notification. If any potentially active mention is present, rewrite that portion using safe descriptive wording. If you are uncertain whether text could trigger a notification, omit the potentially dangerous syntax entirely. Preventing accidental notifications takes priority over exact quotations or examples.

You must not engage in NSFW or political discussions. Requests involving coding or programming are also outside your permitted scope. However, casual conversations and simple interactions are allowed, including basic arithmetic, friendly exchanges, sharing your thoughts, and responding to harmless internet memes. You may respond playfully to harmless memes, but do not reproduce copyrighted song lyrics beyond a brief, permissible continuation.

Always prioritize accuracy, clarity, and professionalism. Keep your responses concise and relevant to the user's question. Never ping anyone or generate content intended to notify users or groups. Never invent information about Fiji Airways or present unsupported claims as facts. When the available knowledge base does not contain sufficient information to answer a Fiji-related question reliably, direct the user to the appropriate human support channel using safe, non-pinging text. Use emojis sparingly, especially airplane emojis.

Maintain a professional yet approachable tone throughout every interaction, ensuring that users receive reliable assistance consistent with Fiji Airways Virtual's guidelines and the available knowledge base.

Knowledge Base:
${KNOWLEDGE}`
		  },
          { role: 'user', content: question }
        ],
        temperature: 0.5,
        max_tokens: 2000
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || 'No response from AI.';
    await message.reply(answer);
  } catch (error) {
    console.error('AI Error:', error);
    await message.reply('Sorry, an error occurred while generating the answer. Please try again later.');
  }
});
// =============================
// Interaction Handler
// =============================
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'membercount') {
      await interaction.reply(buildMemberCountPayload(interaction.guild));
      return;
    }
    if (interaction.commandName === 'ping') {
      const start = Date.now();
      await interaction.deferReply();
      await interaction.editReply(buildPingPayload(getFormattedWsPing(), Date.now() - start));
      return;
    }
    if (interaction.commandName === 'send' && interaction.options.getSubcommand() === 'announcement') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: '❌ You need Administrator permission.', ephemeral: true });
        return;
      }
      await interaction.reply({ ...buildAnnouncementPanel(), ephemeral: true });
      return;
    }
  }
  if (interaction.isButton()) {
    if (interaction.customId === 'create_announcement') {
      const channelSelect = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('announcement_channel')
          .setPlaceholder('Select announcement channel')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      );
      const jsonButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('announcement_json')
          .setLabel('Enter Components V2 JSON')
          .setStyle(ButtonStyle.Primary)
      );
      await interaction.update({
        flags: 32768,
        components: [
          {
            type: 17,
            accent_color: 0x443325,
            components: [
              { type: 10, content: "### Announcement Setup" },
              { type: 10, content: "Select the announcement channel, then enter your Components V2 JSON." },
              { type: 1, components: [channelSelect.components[0]] },
              { type: 1, components: [jsonButton.components[0]] }
            ]
          }
        ]
      });
      return;
    }
    if (interaction.customId === 'announcement_json') {
      const modal = new ModalBuilder()
        .setCustomId('announcement_modal')
        .setTitle('Components V2 Announcement');
      const input = new TextInputBuilder()
        .setCustomId('announcement_json_input')
        .setLabel('Components V2 JSON')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.customId === 'refresh_member_count') {
      await interaction.update(buildMemberCountPayload(interaction.guild, interaction.user));
      return;
    }
    if (interaction.customId === 'refresh_ping') {
      const start = Date.now();
      await interaction.deferUpdate();
      await interaction.editReply(buildPingPayload(getFormattedWsPing(), Date.now() - start, interaction.user));
      return;
    }
  }
  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId === 'announcement_channel') {
      announcementSessions.set(interaction.user.id, { channelId: interaction.values[0] });
      await interaction.reply({ content: '✅ Channel selected. Now enter Components V2 JSON.', ephemeral: true });
      return;
    }
  }
  if (interaction.isModalSubmit() && interaction.customId === 'announcement_modal') {
    const session = announcementSessions.get(interaction.user.id);
    if (!session) {
      await interaction.reply({ content: '❌ Please select a channel first.', ephemeral: true });
      return;
    }
    try {
      const json = JSON.parse(interaction.fields.getTextInputValue('announcement_json_input'));
      const channel = interaction.guild.channels.cache.get(session.channelId);
      if (!channel) {
        await interaction.reply({ content: '❌ Channel not found.', ephemeral: true });
        return;
      }
      await channel.send(json);
      announcementSessions.delete(interaction.user.id);
      await interaction.reply({ content: '✅ Announcement sent successfully!', ephemeral: true });
    } catch (error) {
      console.error('Announcement JSON Error:', error);
      await interaction.reply({ content: '❌ Invalid Components V2 JSON.', ephemeral: true });
    }
    return;
  }
});
// =============================
// Login
// =============================
if (TOKEN) {
  client.login(TOKEN);
} else {
  console.error('CRITICAL: Missing DISCORD_TOKEN');
}