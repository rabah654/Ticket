const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../database/db');

const ticketTypes = {
    general: {
        label: 'General Support',
        description: 'Get help with general questions',
        color: '#5865F2',
        emoji: '<:Paramete:1365076545395228752>'
    },
    technical: {
        label: 'Technical Support',
        description: 'Get help with technical issues',
        color: '#ED4245',
        emoji: '<:6307management:1365076166565822574>'
    },
    billing: {
        label: 'Billing Support',
        description: 'Get help with billing issues',
        color: '#57F287',
        emoji: '<:supermod:1365076007434063885>'
    },
    bug: {
        label: 'Bug Report',
        description: 'Report a bug or issue',
        color: '#FEE75C',
        emoji: '<:stg_report:1365075493547933716>'
    }
};

// Function to generate transcript
async function generateTranscript(channel, ticket) {
    try {
        let transcript = `# Transcript for Ticket ${ticket.ticket_id}\n`;
        transcript += `Type: ${ticketTypes[ticket.type].label}\n`;
        transcript += `Created by: <@${ticket.user_id}>\n`;
        transcript += `Created at: ${new Date(ticket.created_at).toLocaleString()}\n`;
        transcript += `Closed at: ${new Date().toLocaleString()}\n\n`;
        transcript += `## Messages:\n\n`;

        const messages = await channel.messages.fetch({ limit: 100 });
        const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

        for (const message of sortedMessages.values()) {
            const timestamp = new Date(message.createdTimestamp).toLocaleString();
            const author = message.author.tag;
            const content = message.content || '[No text content]';
            
            transcript += `[${timestamp}] ${author}: ${content}\n`;
            
            // Add attachments if any
            if (message.attachments.size > 0) {
                transcript += `Attachments: ${message.attachments.map(a => a.url).join(', ')}\n`;
            }
            
            transcript += '\n';
        }

        return transcript;
    } catch (error) {
        console.error('Error generating transcript:', error);
        return 'Error generating transcript.';
    }
}

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        try {
            if (interaction.isCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;

                // Log command execution
                await client.logger.logCommand({
                    commandName: interaction.commandName,
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    details: `Executed in ${interaction.channel.name}`
                });

                await command.execute(interaction);
            } else if (interaction.isButton()) {
                if (interaction.customId === 'create_ticket') {
                    // Acknowledge the interaction immediately
                    await interaction.deferReply({ flags: [1 << 6] });
                    
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('ticket_type')
                                .setPlaceholder('Select ticket type')
                                .addOptions(
                                    Object.entries(ticketTypes).map(([value, data]) => ({
                                        label: data.label,
                                        description: data.description,
                                        value: value,
                                        emoji: data.emoji
                                    }))
                                )
                        );

                    const embed = new EmbedBuilder()
                        .setTitle('<:ticket_:1365079253829292087> Ticket')
                        .setDescription('Please select the type of ticket you want to create.')
                        .setColor('#5865F2')
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed], components: [row] });
                    
                    // Log button interaction
                    await client.logger.log({
                        type: 'interaction',
                        action: 'button',
                        userId: interaction.user.id,
                        guildId: interaction.guildId,
                        details: 'User clicked create ticket button',
                        channelId: interaction.channelId
                    });
                } else if (interaction.customId.startsWith('close_ticket_')) {
                    // Acknowledge the interaction immediately
                    await interaction.deferReply({ flags: [1 << 6] });
                    
                    const ticketId = interaction.customId.replace('close_ticket_', '');
                    const ticket = await db.getTicket(ticketId);
                    
                    if (!ticket) {
                        await client.logger.logError({
                            error: new Error('Ticket not found'),
                            userId: interaction.user.id,
                            guildId: interaction.guildId,
                            details: `Attempted to close non-existent ticket: ${ticketId}`
                        });
                        
                        return await interaction.editReply({ content: 'Ticket not found!', flags: [1 << 6] });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('🔒 Closing Ticket')
                        .setDescription('Are you sure you want to close this ticket?')
                        .setColor('#ED4245')
                        .addFields(
                            { name: 'Ticket ID', value: ticket.ticket_id, inline: true },
                            { name: 'Type', value: ticketTypes[ticket.type].label, inline: true },
                            { name: 'Created By', value: `<@${ticket.user_id}>`, inline: true }
                        )
                        .setTimestamp();

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`confirm_close_${ticketId}`)
                                .setLabel('Confirm Close')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('cancel_close')
                                .setLabel('Cancel')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    await interaction.editReply({ embeds: [embed], components: [row] });
                    
                    // Log ticket close attempt
                    await client.logger.logTicket({
                        action: 'close_attempt',
                        userId: interaction.user.id,
                        ticketId: ticket.ticket_id,
                        channelId: interaction.channelId,
                        details: 'User attempted to close ticket'
                    });
                } else if (interaction.customId.startsWith('confirm_close_')) {
                    // Acknowledge the interaction immediately
                    await interaction.deferReply({ flags: [1 << 6] });
                    
                    const ticketId = interaction.customId.replace('confirm_close_', '');
                    const ticket = await db.getTicket(ticketId);
                    
                    if (!ticket) {
                        await client.logger.logError({
                            error: new Error('Ticket not found'),
                            userId: interaction.user.id,
                            guildId: interaction.guildId,
                            details: `Attempted to confirm close of non-existent ticket: ${ticketId}`
                        });
                        
                        return await interaction.editReply({ content: 'Ticket not found!', flags: [1 << 6] });
                    }

                    const channel = interaction.guild.channels.cache.get(ticket.channel_id);
                    
                    // Generate transcript before closing the ticket
                    let transcriptContent = '';
                    if (channel) {
                        transcriptContent = await generateTranscript(channel, ticket);
                    }

                    await db.closeTicket(ticketId);
                    
                    // Log ticket closure
                    await client.logger.logTicket({
                        action: 'close',
                        userId: interaction.user.id,
                        ticketId: ticket.ticket_id,
                        channelId: ticket.channel_id,
                        details: 'Ticket closed by user'
                    });

                    if (channel) {
                        const closeEmbed = new EmbedBuilder()
                            .setTitle('🔒 Ticket Closed')
                            .setDescription(`This ticket has been closed by ${interaction.user}`)
                            .setColor('#ED4245')
                            .setTimestamp();

                        await channel.send({ embeds: [closeEmbed] });
                        
                        // Send transcript to the user who created the ticket
                        try {
                            const user = await interaction.client.users.fetch(ticket.user_id);
                            if (user) {
                                const transcriptEmbed = new EmbedBuilder()
                                    .setTitle(`📝 Transcript for Ticket ${ticket.ticket_id}`)
                                    .setDescription(`Here is the transcript of your closed ticket.`)
                                    .setColor(ticketTypes[ticket.type].color)
                                    .addFields(
                                        { name: 'Ticket Type', value: ticketTypes[ticket.type].label, inline: true },
                                        { name: 'Created At', value: new Date(ticket.created_at).toLocaleString(), inline: true },
                                        { name: 'Closed At', value: new Date().toLocaleString(), inline: true },
                                        { name: 'Closed By', value: interaction.user.toString(), inline: true }
                                    )
                                    .setFooter({ text: 'Support Ticket System', iconURL: interaction.client.user.displayAvatarURL() })
                                    .setTimestamp();
                                
                                // Create a buffer from the transcript content
                                const buffer = Buffer.from(transcriptContent, 'utf-8');
                                
                                // Send the transcript as a file attachment
                                await user.send({
                                    embeds: [transcriptEmbed],
                                    files: [{
                                        attachment: buffer,
                                        name: `transcript-${ticket.ticket_id}.txt`
                                    }]
                                });
                                
                                // Log transcript sent
                                await client.logger.logTicket({
                                    action: 'transcript',
                                    userId: ticket.user_id,
                                    ticketId: ticket.ticket_id,
                                    details: 'Transcript sent to user'
                                });
                            }
                        } catch (dmError) {
                            console.error('Error sending transcript to user:', dmError);
                            
                            // Log transcript error
                            await client.logger.logError({
                                error: dmError,
                                userId: ticket.user_id,
                                guildId: interaction.guildId,
                                details: `Failed to send transcript for ticket ${ticket.ticket_id}`
                            });
                        }
                        
                        // Delete the channel after a delay
                        setTimeout(() => channel.delete(), 5000);
                    }

                    await interaction.editReply({ 
                        content: 'Ticket closed successfully!', 
                        embeds: [], 
                        components: [] 
                    });
                } else if (interaction.customId === 'cancel_close') {
                    // Acknowledge the interaction immediately
                    await interaction.deferReply({ flags: [1 << 6] });
                    
                    await interaction.editReply({ 
                        content: 'Ticket close cancelled.', 
                        embeds: [], 
                        components: [] 
                    });
                    
                    // Log cancel close
                    await client.logger.log({
                        type: 'interaction',
                        action: 'button',
                        userId: interaction.user.id,
                        guildId: interaction.guildId,
                        details: 'User cancelled ticket close',
                        channelId: interaction.channelId
                    });
                } else if (interaction.customId.startsWith('claim_ticket_')) {
                    // Acknowledge the interaction immediately
                    await interaction.deferReply({ flags: [1 << 6] });
                    
                    const ticketId = interaction.customId.replace('claim_ticket_', '');
                    const ticket = await db.getTicket(ticketId);
                    
                    if (!ticket) {
                        await client.logger.logError({
                            error: new Error('Ticket not found'),
                            userId: interaction.user.id,
                            guildId: interaction.guildId,
                            details: `Attempted to claim non-existent ticket: ${ticketId}`
                        });
                        
                        return await interaction.editReply({ content: 'Ticket not found!', flags: [1 << 6] });
                    }

                    if (ticket.claimed_by) {
                        await client.logger.log({
                            type: 'interaction',
                            action: 'claim_attempt',
                            userId: interaction.user.id,
                            guildId: interaction.guildId,
                            details: `Attempted to claim already claimed ticket: ${ticketId}`,
                            ticketId: ticket.ticket_id
                        });
                        
                        return await interaction.editReply({ 
                            content: `This ticket is already claimed by <@${ticket.claimed_by}>`, 
                            flags: [1 << 6] 
                        });
                    }

                    await db.updateTicketStatus(ticketId, 'claimed', interaction.user.id);
                    
                    // Log ticket claim
                    await client.logger.logTicket({
                        action: 'claim',
                        userId: interaction.user.id,
                        ticketId: ticket.ticket_id,
                        channelId: ticket.channel_id,
                        details: 'Ticket claimed by staff'
                    });

                    const channel = interaction.guild.channels.cache.get(ticket.channel_id);
                    if (channel) {
                        const claimEmbed = new EmbedBuilder()
                            .setTitle('👋 Ticket Claimed')
                            .setDescription(`This ticket has been claimed by ${interaction.user}`)
                            .setColor('#57F287')
                            .setTimestamp();

                        await channel.send({ embeds: [claimEmbed] });
                    }

                    await interaction.editReply({ 
                        content: 'Ticket claimed successfully!', 
                        flags: [1 << 6] 
                    });
                } else if (interaction.customId.startsWith('transcript_')) {
                    // Acknowledge the interaction immediately
                    await interaction.deferReply({ flags: [1 << 6] });
                    
                    const ticketId = interaction.customId.replace('transcript_', '');
                    const ticket = await db.getTicket(ticketId);
                    
                    if (!ticket) {
                        await client.logger.logError({
                            error: new Error('Ticket not found'),
                            userId: interaction.user.id,
                            guildId: interaction.guildId,
                            details: `Attempted to get transcript for non-existent ticket: ${ticketId}`
                        });
                        
                        return await interaction.editReply({ content: 'Ticket not found!', flags: [1 << 6] });
                    }
                    
                    const channel = interaction.guild.channels.cache.get(ticket.channel_id);
                    if (!channel) {
                        await client.logger.logError({
                            error: new Error('Channel not found'),
                            userId: interaction.user.id,
                            guildId: interaction.guildId,
                            details: `Attempted to get transcript for ticket with missing channel: ${ticketId}`
                        });
                        
                        return await interaction.editReply({ content: 'Ticket channel not found!', flags: [1 << 6] });
                    }
                    
                    // Generate transcript
                    const transcriptContent = await generateTranscript(channel, ticket);
                    
                    // Create a buffer from the transcript content
                    const buffer = Buffer.from(transcriptContent, 'utf-8');
                    
                    // Send the transcript as a file attachment
                    await interaction.editReply({
                        content: 'Here is the transcript of your ticket:',
                        files: [{
                            attachment: buffer,
                            name: `transcript-${ticket.ticket_id}.txt`
                        }]
                    });
                    
                    // Log transcript download
                    await client.logger.logTicket({
                        action: 'transcript_download',
                        userId: interaction.user.id,
                        ticketId: ticket.ticket_id,
                        details: 'User downloaded ticket transcript'
                    });
                }
            } else if (interaction.isStringSelectMenu()) {
                if (interaction.customId === 'ticket_type') {
                    // Acknowledge the interaction immediately
                    await interaction.deferReply({ flags: [1 << 6] });
                    
                    const ticketType = interaction.values[0];
                    const typeData = ticketTypes[ticketType];
                    
                    const existingTickets = await db.getUserTickets(interaction.user.id);
                    if (existingTickets.length >= 3) {
                        await client.logger.log({
                            type: 'interaction',
                            action: 'ticket_limit',
                            userId: interaction.user.id,
                            guildId: interaction.guildId,
                            details: 'User attempted to create more than 3 tickets'
                        });
                        
                        return await interaction.editReply({ 
                            content: 'You have reached the maximum number of open tickets (3). Please close an existing ticket before creating a new one.', 
                            flags: [1 << 6] 
                        });
                    }

                    const ticketId = `TICKET-${Date.now()}`;
                    const channel = await interaction.guild.channels.create({
                        name: `ticket-${ticketId.toLowerCase()}`,
                        type: 0,
                        parent: process.env.TICKET_CATEGORY_ID,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.id,
                                deny: ['ViewChannel']
                            },
                            {
                                id: interaction.user.id,
                                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
                            }
                        ]
                    });

                    const ticketData = {
                        ticket_id: ticketId,
                        user_id: interaction.user.id,
                        channel_id: channel.id,
                        type: ticketType
                    };

                    const { ticketNumber } = await db.createTicket(ticketData);
                    
                    // Log ticket creation
                    await client.logger.logTicket({
                        action: 'create',
                        userId: interaction.user.id,
                        ticketId: ticketId,
                        channelId: channel.id,
                        details: `Ticket created with type: ${typeData.label}`
                    });

                    const embed = new EmbedBuilder()
                        .setTitle(`${typeData.emoji} New Ticket #${ticketNumber}`)
                        .setDescription(`Welcome to your ticket, ${interaction.user}!`)
                        .setColor(typeData.color)
                        .addFields(
                            { name: 'Ticket Type', value: typeData.label, inline: true },
                            { name: 'Created By', value: interaction.user.toString(), inline: true },
                            { name: 'Ticket ID', value: ticketId, inline: true },
                            { name: 'Created At', value: new Date().toLocaleString(), inline: true }
                        )
                        .setThumbnail(interaction.user.displayAvatarURL())
                        .setFooter({ text: 'Support Ticket System', iconURL: interaction.client.user.displayAvatarURL() })
                        .setTimestamp();

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`close_ticket_${ticketId}`)
                                .setLabel('Close Ticket')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId(`claim_ticket_${ticketId}`)
                                .setLabel('Claim Ticket')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId(`transcript_${ticketId}`)
                                .setLabel('Download Transcript')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    await channel.send({ 
                        content: `${interaction.user} Welcome to your ticket!`,
                        embeds: [embed],
                        components: [row]
                    });

                    const logChannel = interaction.guild.channels.cache.get(process.env.LOG_CHANNEL_ID);
                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('📝 New Ticket Created')
                            .setDescription(`A new ticket has been created by ${interaction.user}`)
                            .setColor(typeData.color)
                            .addFields(
                                { name: 'Ticket Type', value: typeData.label, inline: true },
                                { name: 'Ticket ID', value: ticketId, inline: true },
                                { name: 'Channel', value: channel.toString(), inline: true }
                            )
                            .setTimestamp();

                        await logChannel.send({ embeds: [logEmbed] });
                    }

                    await interaction.editReply({ 
                        content: `Ticket created successfully! Check ${channel}`, 
                        embeds: [], 
                        components: [] 
                    });
                }
            }
        } catch (error) {
            console.error('Error handling interaction:', error);
            
            // Log the error
            await client.logger.logError({
                error,
                userId: interaction.user?.id,
                guildId: interaction.guildId,
                commandName: interaction.commandName,
                details: 'Error handling interaction'
            });
            
            // Check if we can still respond to the interaction
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({ 
                        content: 'There was an error while processing your request. Please try again later.',
                        flags: [1 << 6]
                    });
                } catch (replyError) {
                    console.error('Error sending error message:', replyError);
                }
            } else if (interaction.deferred && !interaction.replied) {
                try {
                    await interaction.editReply({ 
                        content: 'There was an error while processing your request. Please try again later.',
                        flags: [1 << 6]
                    });
                } catch (editError) {
                    console.error('Error editing reply:', editError);
                }
            }
        }
    }
}; 