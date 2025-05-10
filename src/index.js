require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./database/db');
const Logger = require('./utils/logger');

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Initialize the logger
client.logger = new Logger(client);

// Create a new commands collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    // Set a new item in the Collection with the key as the command name and the value as the exported module
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
    
    console.log(`Loaded event: ${event.name}`);
}

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
    client.logger.logError({
        error,
        details: 'Unhandled promise rejection'
    });
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    client.logger.logError({
        error,
        details: 'Uncaught exception'
    });
});

// Login to Discord with your client's token
client.login(process.env.TOKEN).then(() => {
    console.log(`✅ ${client.user.tag} is now online!`);
    client.logger.log({
        type: 'system',
        action: 'startup',
        details: `Bot started up successfully as ${client.user.tag}`,
        color: '#57F287',
        emoji: '✅'
    });
}).catch(error => {
    console.error('Error logging in:', error);
    client.logger.logError({
        error,
        details: 'Failed to login to Discord'
    });
}); 