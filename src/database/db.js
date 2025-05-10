const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');


const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'tickets.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to the tickets database.');
    }
});


db.serialize(() => {

    db.get("PRAGMA table_info(tickets)", (err, rows) => {
        if (err) {
            console.error('Error checking table structure:', err);
        } else {

            db.run(`
                CREATE TABLE IF NOT EXISTS tickets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_id TEXT NOT NULL,
                    ticket_number INTEGER NOT NULL,
                    user_id TEXT NOT NULL,
                    channel_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT DEFAULT 'open',
                    claimed_by TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    closed_at DATETIME
                )
            `);
            

            db.all("PRAGMA table_info(tickets)", (err, columns) => {
                if (err) {
                    console.error('Error checking columns:', err);
                } else {

                    const hasTicketNumber = columns.some(col => col.name === 'ticket_number');
                    

                    if (!hasTicketNumber) {
                        console.log('Adding ticket_number column to tickets table...');
                        db.run('ALTER TABLE tickets ADD COLUMN ticket_number INTEGER', (err) => {
                            if (err) {
                                console.error('Error adding ticket_number column:', err);
                            } else {
                                console.log('Successfully added ticket_number column');
                            }
                        });
                    }
                    
                    // Check if claimed_by column exists
                    const hasClaimedBy = columns.some(col => col.name === 'claimed_by');
                    
                    // Add claimed_by column if it doesn't exist
                    if (!hasClaimedBy) {
                        console.log('Adding claimed_by column to tickets table...');
                        db.run('ALTER TABLE tickets ADD COLUMN claimed_by TEXT', (err) => {
                            if (err) {
                                console.error('Error adding claimed_by column:', err);
                            } else {
                                console.log('Successfully added claimed_by column');
                            }
                        });
                    }
                }
            });
        }
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS ticket_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id TEXT NOT NULL,
            action TEXT NOT NULL,
            user_id TEXT NOT NULL,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    

    db.run(`
        CREATE TABLE IF NOT EXISTS counters (
            name TEXT PRIMARY KEY,
            value INTEGER DEFAULT 0
        )
    `);
    

    db.run(`
        INSERT OR IGNORE INTO counters (name, value) VALUES ('ticket_counter', 0)
    `);
});


module.exports = {

    getNextTicketNumber: () => {
        return new Promise((resolve, reject) => {
            db.run('UPDATE counters SET value = value + 1 WHERE name = ?', ['ticket_counter'], function(err) {
                if (err) reject(err);
                else {
                    db.get('SELECT value FROM counters WHERE name = ?', ['ticket_counter'], (err, row) => {
                        if (err) reject(err);
                        else resolve(row.value);
                    });
                }
            });
        });
    },
    
    createTicket: async (ticketData) => {
        try {
            const ticketNumber = await module.exports.getNextTicketNumber();
            return new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO tickets (ticket_id, ticket_number, user_id, channel_id, type) VALUES (?, ?, ?, ?, ?)',
                    [ticketData.ticket_id, ticketNumber, ticketData.user_id, ticketData.channel_id, ticketData.type],
                    function(err) {
                        if (err) reject(err);
                        else resolve({ lastID: this.lastID, ticketNumber });
                    }
                );
            });
        } catch (error) {
            throw error;
        }
    },
    
    closeTicket: (ticketId) => {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE tickets SET status = ?, closed_at = CURRENT_TIMESTAMP WHERE ticket_id = ?',
                ['closed', ticketId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    },
    
    getTicket: (ticketId) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM tickets WHERE ticket_id = ?', [ticketId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },
    
    getUserTickets: (userId) => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM tickets WHERE user_id = ? AND status = ?', [userId, 'open'], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    
    getAllTickets: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM tickets', [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    
    getOpenTickets: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM tickets WHERE status = ? ORDER BY created_at DESC', ['open'], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    
    updateTicketStatus: (ticketId, status, claimedBy = null) => {
        return new Promise((resolve, reject) => {
            const query = claimedBy 
                ? 'UPDATE tickets SET status = ?, claimed_by = ? WHERE ticket_id = ?'
                : 'UPDATE tickets SET status = ? WHERE ticket_id = ?';
            const params = claimedBy 
                ? [status, claimedBy, ticketId]
                : [status, ticketId];
            
            db.run(query, params, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    },
    
    addLog: (logData) => {
        return new Promise((resolve, reject) => {
            // Use 'system' as ticket_id for non-ticket logs
            const ticketId = logData.ticket_id || 'system';
            const userId = logData.user_id || 'system';
            
            db.run(
                'INSERT INTO ticket_logs (ticket_id, action, user_id, details) VALUES (?, ?, ?, ?)',
                [ticketId, logData.action, userId, logData.details],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },
    
    getTicketLogs: (ticketId) => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM ticket_logs WHERE ticket_id = ? ORDER BY created_at DESC', [ticketId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}; 