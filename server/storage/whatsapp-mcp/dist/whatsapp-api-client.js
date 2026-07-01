"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppApiClient = void 0;
const axios_1 = __importDefault(require("axios"));
// Helper function to convert errors to strings
function errorToString(error) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}
class WhatsAppApiClient {
    constructor(baseUrl, apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.axiosInstance = axios_1.default.create({
            baseURL: this.baseUrl,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
            },
        });
    }
    async getStatus() {
        try {
            const response = await this.axiosInstance.get('/status');
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to get client status: ${errorToString(error)}`);
        }
    }
    async getContacts() {
        try {
            const response = await this.axiosInstance.get('/contacts');
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to fetch contacts: ${errorToString(error)}`);
        }
    }
    async searchContacts(query) {
        try {
            const response = await this.axiosInstance.get('/contacts/search', {
                params: { query },
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to search contacts: ${errorToString(error)}`);
        }
    }
    async getChats() {
        try {
            const response = await this.axiosInstance.get('/chats');
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to fetch chats: ${errorToString(error)}`);
        }
    }
    async getMessages(number, limit = 10) {
        try {
            const response = await this.axiosInstance.get(`/messages/${number}`, {
                params: { limit },
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to fetch messages: ${errorToString(error)}`);
        }
    }
    async sendMessage(number, message) {
        try {
            const response = await this.axiosInstance.post('/send', {
                number,
                message,
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to send message: ${errorToString(error)}`);
        }
    }
    async createGroup(name, participants) {
        try {
            const response = await this.axiosInstance.post('/groups', {
                name,
                participants,
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to create group: ${errorToString(error)}`);
        }
    }
    async addParticipantsToGroup(groupId, participants) {
        try {
            const response = await this.axiosInstance.post(`/groups/${groupId}/participants/add`, {
                participants,
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to add participants to group: ${errorToString(error)}`);
        }
    }
    async getGroupMessages(groupId, limit = 10) {
        try {
            const response = await this.axiosInstance.get(`/groups/${groupId}/messages`, {
                params: { limit },
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to fetch group messages: ${errorToString(error)}`);
        }
    }
    async sendGroupMessage(groupId, message) {
        try {
            const response = await this.axiosInstance.post(`/groups/${groupId}/send`, {
                message,
            });
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to send group message: ${errorToString(error)}`);
        }
    }
    async getGroups() {
        try {
            const response = await this.axiosInstance.get('/groups');
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to fetch groups: ${errorToString(error)}`);
        }
    }
    async getGroupById(groupId) {
        try {
            const response = await this.axiosInstance.get(`/groups/${groupId}`);
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to fetch group by ID: ${errorToString(error)}`);
        }
    }
    async searchGroups(query) {
        try {
            const response = await this.axiosInstance.get(`/groups/search?query=${encodeURIComponent(query)}`);
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to search groups: ${errorToString(error)}`);
        }
    }
    async downloadMediaFromMessage(messageId) {
        try {
            const response = await this.axiosInstance.post(`/messages/${messageId}/media/download`);
            return response.data;
        }
        catch (error) {
            throw new Error(`Failed to download media from message: ${errorToString(error)}`);
        }
    }
}
exports.WhatsAppApiClient = WhatsAppApiClient;
//# sourceMappingURL=whatsapp-api-client.js.map