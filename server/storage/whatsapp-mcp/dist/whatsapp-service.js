"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
exports.timestampToIso = timestampToIso;
// @ts-expect-error - ImportType not exported in whatsapp-web.js but needed for GroupChat functionality
const GroupChat_1 = __importDefault(require("whatsapp-web.js/src/structures/GroupChat"));
const logger_1 = __importDefault(require("./logger"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const mime_types_1 = __importDefault(require("mime-types"));
function timestampToIso(timestamp) {
    return new Date(timestamp * 1000).toISOString();
}
class WhatsAppService {
    constructor(client) {
        this.client = client;
    }
    async getStatus() {
        try {
            const status = this.client.info ? 'connected' : 'disconnected';
            return {
                status,
                info: this.client.info,
            };
        }
        catch (error) {
            throw new Error(`Failed to get client status: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getContacts() {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            const contacts = await this.client.getContacts();
            const filteredContacts = contacts.filter((contact) => contact.isUser && contact.id.server === 'c.us' && !contact.isMe);
            return filteredContacts.map((contact) => ({
                name: contact.pushname || 'Unknown',
                number: contact.number,
            }));
        }
        catch (error) {
            throw new Error(`Failed to fetch contacts: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async searchContacts(query) {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            const contacts = await this.client.getContacts();
            const filteredContacts = contacts.filter((contact) => contact.isUser &&
                contact.id.server === 'c.us' &&
                !contact.isMe &&
                ((contact.pushname && contact.pushname.toLowerCase().includes(query.toLowerCase())) ||
                    (contact.number && contact.number.includes(query))));
            return filteredContacts.map((contact) => ({
                name: contact.pushname || 'Unknown',
                number: contact.number,
            }));
        }
        catch (error) {
            throw new Error(`Failed to search contacts: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getChats() {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            const chats = await this.client.getChats();
            return chats.map(chat => {
                const lastMessageTimestamp = chat.lastMessage
                    ? timestampToIso(chat.lastMessage.timestamp)
                    : '';
                return {
                    id: chat.id._serialized,
                    name: chat.name,
                    unreadCount: chat.unreadCount,
                    timestamp: lastMessageTimestamp,
                    lastMessage: chat.lastMessage ? chat.lastMessage.body : '',
                };
            });
        }
        catch (error) {
            throw new Error(`Failed to fetch chats: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getMessages(number, limit = 10) {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            // Ensure number is a string
            if (typeof number !== 'string' || number.trim() === '') {
                throw new Error('Invalid phone number');
            }
            // Format the chat ID
            const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
            // Get the chat
            const chat = await this.client.getChatById(chatId);
            const messages = await chat.fetchMessages({ limit });
            return messages.map(message => ({
                id: message.id._serialized,
                body: message.body,
                fromMe: message.fromMe,
                timestamp: timestampToIso(message.timestamp),
                contact: message.fromMe ? undefined : message.author?.split('@')[0],
                type: message.type,
            }));
        }
        catch (error) {
            throw new Error(`Failed to fetch messages: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async sendMessage(number, message) {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            // Ensure number is a string
            if (typeof number !== 'string' || number.trim() === '') {
                throw new Error('Invalid phone number');
            }
            // Format the chat ID
            const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
            // Send the message
            const result = await this.client.sendMessage(chatId, message);
            return {
                messageId: result.id.id,
            };
        }
        catch (error) {
            throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async createGroup(name, participants) {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            if (typeof name !== 'string' || name.trim() === '') {
                throw new Error('Invalid group name');
            }
            const formattedParticipants = participants.map(p => (p.includes('@c.us') ? p : `${p}@c.us`));
            // Create the group
            const result = await this.client.createGroup(name, formattedParticipants);
            // Handle both string and object return types
            let groupId = '';
            let inviteCode = undefined;
            if (typeof result === 'string') {
                groupId = result;
            }
            else if (result && typeof result === 'object') {
                // Safely access properties
                groupId = result.gid && result.gid._serialized ? result.gid._serialized : '';
                inviteCode = result.inviteCode;
            }
            return {
                groupId,
                inviteCode,
            };
        }
        catch (error) {
            throw new Error(`Failed to create group: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async addParticipantsToGroup(groupId, participants) {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            if (typeof groupId !== 'string' || groupId.trim() === '') {
                throw new Error('Invalid group ID');
            }
            const formattedParticipants = participants.map(p => (p.includes('@c.us') ? p : `${p}@c.us`));
            const chat = await this.getRawGroup(groupId);
            const results = (await chat.addParticipants(formattedParticipants));
            const resultMap = {};
            if (typeof results === 'object') {
                for (const [id, result] of Object.entries(results)) {
                    resultMap[id] = result;
                }
            }
            else {
                // If the result is not an object, string is a error message
                throw new Error(results);
            }
            // Process results
            const added = [];
            const failed = [];
            for (const [id, success] of Object.entries(resultMap)) {
                const number = id.split('@')[0];
                if (success.code === 200) {
                    added.push(number);
                }
                else {
                    failed.push({ number, reason: success.message });
                }
            }
            return {
                success: failed.length === 0,
                added,
                failed: failed.length > 0 ? failed : undefined,
            };
        }
        catch (error) {
            throw new Error(`Failed to add participants to group: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getGroupMessages(groupId, limit = 10) {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            // Ensure groupId is valid
            if (typeof groupId !== 'string' || groupId.trim() === '') {
                throw new Error('Invalid group ID');
            }
            // Format the group ID
            const formattedGroupId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
            // Get the chat
            const chat = await this.client.getChatById(formattedGroupId);
            const messages = await chat.fetchMessages({ limit });
            return messages.map(message => ({
                id: message.id._serialized,
                body: message.body,
                fromMe: message.fromMe,
                timestamp: timestampToIso(message.timestamp),
                contact: message.fromMe ? undefined : message.author?.split('@')[0],
                type: message.type,
            }));
        }
        catch (error) {
            throw new Error(`Failed to fetch group messages: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async sendGroupMessage(groupId, message) {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            // Ensure groupId is valid
            if (typeof groupId !== 'string' || groupId.trim() === '') {
                throw new Error('Invalid group ID');
            }
            // Format the group ID
            const formattedGroupId = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
            // Send the message
            const result = await this.client.sendMessage(formattedGroupId, message);
            return {
                messageId: result.id.id,
            };
        }
        catch (error) {
            throw new Error(`Failed to send group message: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getUserName(id) {
        const contact = await this.client.getContactById(id);
        return contact.pushname || contact.name || undefined;
    }
    async getGroups() {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            // Get all chats
            // It's not possible to use getGroups because WhatsApp Client is not setting the isGroup property
            // @ts-expect-error - Using raw API to access methods not exposed in the Client type
            const rawChats = await this.client.pupPage.evaluate(async () => {
                // @ts-expect-error - Accessing window.WWebJS which is not typed but exists at runtime
                return await window.WWebJS.getChats();
            });
            const groupChats = rawChats
                .filter((chat) => chat.groupMetadata)
                .map((chat) => {
                chat.isGroup = true;
                return new GroupChat_1.default(this.client, chat);
            });
            logger_1.default.info(`Found ${groupChats.length} groups`);
            const groups = await Promise.all(groupChats.map(async (chat) => ({
                id: chat.id._serialized,
                name: chat.name,
                description: (chat.groupMetadata || {}).subject || '',
                participants: await Promise.all(chat.participants.map(async (participant) => ({
                    id: participant.id._serialized,
                    number: participant.id.user,
                    isAdmin: participant.isAdmin,
                    name: await this.getUserName(participant.id._serialized),
                }))),
                createdAt: chat.timestamp ? timestampToIso(chat.timestamp) : new Date().toISOString(),
            })));
            return groups;
        }
        catch (error) {
            throw new Error(`Failed to fetch groups: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getGroupById(groupId) {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            // Ensure groupId is valid
            if (typeof groupId !== 'string' || groupId.trim() === '') {
                throw new Error('Invalid group ID');
            }
            // It's not possible to use getChatById because WhatsApp Client is not setting the isGroup property
            const chat = await this.getRawGroup(groupId);
            return {
                id: chat.id._serialized,
                name: chat.name,
                description: (chat.groupMetadata || {}).subject || '',
                participants: await Promise.all(chat.participants.map(async (participant) => ({
                    id: participant.id._serialized,
                    number: participant.id.user,
                    isAdmin: participant.isAdmin,
                    name: await this.getUserName(participant.id._serialized),
                }))),
                createdAt: chat.timestamp ? timestampToIso(chat.timestamp) : new Date().toISOString(),
            };
        }
        catch (error) {
            throw new Error(`Failed to fetch groups: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async searchGroups(query) {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            const allGroups = await this.getGroups();
            const lowerQuery = query.toLowerCase();
            const matchingGroups = allGroups.filter(group => {
                if (group.name.toLowerCase().includes(lowerQuery)) {
                    return true;
                }
                if (group.description && group.description.toLowerCase().includes(lowerQuery)) {
                    return true;
                }
                return false;
            });
            return matchingGroups;
        }
        catch (error) {
            throw new Error(`Failed to search groups: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getRawGroup(groupId) {
        // Clean up the group ID if it doesn't have the suffix
        const formattedGroupId = groupId.endsWith('@g.us') ? groupId : `${groupId}@g.us`;
        // @ts-expect-error - Using raw API to access methods not exposed in the Client type
        const rawChat = await this.client.pupPage.evaluate(async (chatId) => {
            // @ts-expect-error - Accessing window.WWebJS which is not typed but exists at runtime
            return await window.WWebJS.getChat(chatId);
        }, formattedGroupId);
        // Check if it's a group chat
        if (!rawChat.groupMetadata) {
            throw new Error('The provided ID is not a group chat');
        }
        return new GroupChat_1.default(this.client, rawChat);
    }
    // Download media from a message
    async downloadMediaFromMessage(messageId, mediaStoragePath) {
        try {
            if (!this.client.info) {
                throw new Error('WhatsApp client not ready. Please try again later.');
            }
            const message = await this.client.getMessageById(messageId);
            if (!message) {
                throw new Error(`Message with ID ${messageId} not found`);
            }
            if (!message.hasMedia) {
                throw new Error(`Message with ID ${messageId} does not contain media`);
            }
            const media = await message.downloadMedia();
            if (!media) {
                throw new Error(`Failed to download media from message ${messageId}`);
            }
            // Generate a unique filename based on messageId
            const extension = mime_types_1.default.extension(media.mimetype) || 'bin';
            const filename = `${messageId.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}`;
            const relativePath = path_1.default.join(mediaStoragePath, filename);
            // Convert to absolute path
            const absolutePath = path_1.default.resolve(relativePath);
            // Write the media to a file asynchronously
            const buffer = Buffer.from(media.data, 'base64');
            await fs_1.default.promises.writeFile(absolutePath, buffer);
            // Get file size asynchronously
            const stats = await fs_1.default.promises.stat(absolutePath);
            return {
                filePath: absolutePath, // Return the absolute path
                mimetype: media.mimetype,
                filename,
                filesize: stats.size,
                messageId, // This is already the serialized messageId as you fixed
            };
        }
        catch (error) {
            logger_1.default.error('Failed to download media', { error });
            throw new Error(`Failed to download media: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.WhatsAppService = WhatsAppService;
//# sourceMappingURL=whatsapp-service.js.map