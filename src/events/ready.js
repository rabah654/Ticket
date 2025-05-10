const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`✅ ${client.user.tag} is now online!`);
        
        // تعيين حالة البوت
        client.user.setPresence({
            activities: [{ 
                name: 'نظام التذاكر | /ticket',
                type: 3 // Watching
            }],
            status: 'online'
        });
    },
}; 