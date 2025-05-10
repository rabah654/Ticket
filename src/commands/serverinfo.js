const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = { 
data: new SlashCommandBuilder() 
.setName('serverinfo') 
.setDescription('Display server information'), 

async execute(interaction) { 
const guild = interaction.guild; 
const embed = new EmbedBuilder()
.setTitle(`ℹ️ Server Information ${guild.name}`)
.setColor('#2F3136')
.addFields(
{ name: '🆔 Server ID', value: guild.id, inline: true },
{ name: '👑 Owner', value: `<@${guild.ownerId}>`, inline: true },
{ name: '📅 Creation Date', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
{ name: '👥 Number of Members', value: guild.memberCount.toString(), inline: true },
{ name: '🤖 Number of Bots', value: guild.members.cache.filter(member => member.user.bot).size.toString(), inline: true },
{ name: '📊 Number of Channels', value: guild.channels.cache.size.toString(), inline: true }
)
.setThumbnail(guild.iconURL())
.setImage(guild.bannerURL())
.setTimestamp()
.setFooter({ text: 'Advanced Ticketing System', iconURL: guild.iconURL() });

await interaction.reply({ embeds: [embed] });
}
};