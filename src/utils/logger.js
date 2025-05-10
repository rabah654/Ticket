const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');

class Logger {
    constructor(client) {
        this.client = client;
    }

    /**
     * Log an event to both the database and Discord
     * @param {Object} options - Log options
     * @param {string} options.type - Type of log (ticket, command, error, etc.)
     * @param {string} options.action - Action performed (create, close, delete, etc.)
     * @param {string} options.userId - ID of the user who performed the action
     * @param {string} options.guildId - ID of the guild where the action occurred
     * @param {string} options.details - Additional details about the action
     * @param {string} [options.ticketId] - ID of the ticket (if applicable)
     * @param {string} [options.channelId] - ID of the channel (if applicable)
     * @param {string} [options.color] - Color for the embed (hex code)
     * @param {string} [options.emoji] - Emoji to display in the log
     */
    async log(options) {
        const {
            type,
            action,
            userId,
            guildId,
            details,
            ticketId,
            channelId,
            color = '#5865F2',
            emoji = '📝'
        } = options;

        // Add to database only if it's a ticket log or if ticketId is provided
        if (type === 'ticket' || ticketId) {
            try {
                await db.addLog({
                    ticket_id: ticketId || 'system', // Use 'system' as a fallback for non-ticket logs
                    action: `${type}:${action}`,
                    user_id: userId || 'system',
                    details: details
                });
            } catch (error) {
                console.error('Error logging to database:', error);
            }
        }

        // Create embed for Discord
        const embed = new EmbedBuilder()
            .setTitle(`${emoji} ${this._formatTitle(type, action)}`)
            .setDescription(details)
            .setColor(color)
            .setTimestamp();

        // Add fields based on available information
        if (userId) {
            embed.addFields({ name: 'User', value: `<@${userId}>`, inline: true });
        }
        
        if (guildId) {
            embed.addFields({ name: 'Server', value: `<@&${guildId}>`, inline: true });
        }
        
        if (ticketId) {
            embed.addFields({ name: 'Ticket ID', value: ticketId, inline: true });
        }
        
        if (channelId) {
            embed.addFields({ name: 'Channel', value: `<#${channelId}>`, inline: true });
        }

        // Send to log channel if configured
        if (process.env.LOG_CHANNEL_ID) {
            try {
                const logChannel = await this.client.channels.fetch(process.env.LOG_CHANNEL_ID);
                if (logChannel) {
                    await logChannel.send({ embeds: [embed] });
                }
            } catch (error) {
                console.error('Error sending log to channel:', error);
            }
        }

        // Log to console for debugging
        console.log(`[${type.toUpperCase()}:${action.toUpperCase()}] ${details}`);
    }

    /**
     * Log a ticket event
     * @param {Object} options - Ticket log options
     */
    async logTicket(options) {
        const {
            action,
            userId,
            ticketId,
            channelId,
            details,
            color
        } = options;

        // Determine emoji and color based on action
        let emoji = '🎫';
        let actionColor = color || '#5865F2';

        switch (action) {
            case 'create':
                emoji = '📝';
                actionColor = color || '#57F287';
                break;
            case 'close':
                emoji = '🔒';
                actionColor = color || '#ED4245';
                break;
            case 'claim':
                emoji = '👋';
                actionColor = color || '#FEE75C';
                break;
            case 'transcript':
                emoji = '📄';
                actionColor = color || '#5865F2';
                break;
        }

        // Get guild ID from the channel
        let guildId = null;
        if (channelId) {
            try {
                const channel = await this.client.channels.fetch(channelId);
                if (channel) {
                    guildId = channel.guild.id;
                }
            } catch (error) {
                console.error('Error fetching channel for logging:', error);
            }
        }

        // Log the event
        await this.log({
            type: 'ticket',
            action,
            userId,
            guildId,
            ticketId,
            channelId,
            details,
            color: actionColor,
            emoji
        });
    }

    /**
     * Log a command execution
     * @param {Object} options - Command log options
     */
    async logCommand(options) {
        const {
            commandName,
            userId,
            guildId,
            details,
            success = true
        } = options;

        await this.log({
            type: 'command',
            action: success ? 'execute' : 'error',
            userId,
            guildId,
            details: `Command: ${commandName}\n${details}`,
            color: success ? '#57F287' : '#ED4245',
            emoji: success ? '✅' : '❌'
        });
    }

    /**
     * Log an error
     * @param {Object} options - Error log options
     */
    async logError(options) {
        const {
            error,
            userId,
            guildId,
            commandName,
            details
        } = options;

        const errorDetails = `
Error: ${error.message}
Stack: ${error.stack}
${details || ''}
${commandName ? `Command: ${commandName}` : ''}
        `.trim();

        await this.log({
            type: 'error',
            action: 'occurred',
            userId,
            guildId,
            details: errorDetails,
            color: '#ED4245',
            emoji: '⚠️'
        });
    }

    /**
     * Format the title for the embed
     * @private
     */
    _formatTitle(type, action) {
        return `${type.charAt(0).toUpperCase() + type.slice(1)} ${action.charAt(0).toUpperCase() + action.slice(1)}`;
    }
}

module.exports = Logger; 