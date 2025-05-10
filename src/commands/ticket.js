const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionResponse } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Create a new support ticket')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Brief reason for creating the ticket')
                .setRequired(false)),

    async execute(interaction) {
        try {
            // Create the embed and button first
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('create_ticket')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('<:Ticket:1365078645831372821>')
                );

            const embed = new EmbedBuilder()
                .setTitle('<:Ticket:1365078645831372821> Support Ticket System')
                .setDescription('Click the button below to create a new support ticket.')
                .addFields(
                    { name: 'Available Ticket Types', value: '• General Support (<:Paramete:1365076545395228752>)\n• Technical Support (<:6307management:1365076166565822574>)\n• Billing Support (<:supermod:1365076007434063885>)\n• Bug Report (<:stg_report:1365075493547933716>)', inline: false },
                    { name: 'Note', value: 'You can have up to 3 open tickets at a time.', inline: false }
                )
                .setColor('#5865F2')
                .setFooter({ text: 'Support Ticket System', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            // Send the message directly to the channel
            await interaction.channel.send({ 
                embeds: [embed], 
                components: [row] 
            });
            
            // Send a simple ephemeral reply to the user using flags instead of ephemeral
            await interaction.reply({ 
                content: 'Ticket menu has been created!', 
                flags: [1 << 6] // This is the equivalent of ephemeral: true
            });
        } catch (error) {
            console.error('Error in ticket command:', error);
            
            // Only try to respond if we haven't already
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ 
                        content: 'There was an error while creating the ticket menu. Please try again later.',
                        flags: [1 << 6] // This is the equivalent of ephemeral: true
                    });
                } catch (replyError) {
                    console.error('Error sending error message:', replyError);
                }
            }
        }
    },
}; 