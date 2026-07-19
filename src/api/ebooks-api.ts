import apiClient, { getAccessToken, clientId } from './client';

export interface PresenceStatus {
    holderId: string | null;
    holderEmail: string | null;
    others: string[];
    canEdit: boolean;
}

export interface Ebook {
    ebook_isbn: string;
    physical_isbn: string;
    title: string;
    author: string;
    description?: string;
    publisher?: string;
    language?: string;
    subjects?: string;
    pub_date?: string;
    status: 'in_progress' | 'completed';
    created_at?: string;
    deleted_at?: string;
}

export interface ShareUser {
    id: number;
    email: string;
}

export interface HistoryFile {
    filename: string;
    timestamp: string;
}

export interface EpubFile {
    filename: string;
    timestamp: string;
    size: number;
}

export interface ValidationIssue {
    message: string;
    rule?: string;
    description?: string;
    file?: string;
    impact?: string;
    location?: string;
    html?: string;
    outcome?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    summary?: string;
}

export const ebooksApi = {
    // List all ebooks
    getAll: () => apiClient.get<{ data: Ebook[] }>('/ebooks'),

    // Get a single ebook
    get: (isbn: string) => apiClient.get<{ data: Ebook }>(`/ebooks/${isbn}`),

    // Create a new ebook
    create: (data: Omit<Ebook, 'status'>) => apiClient.post('/ebooks', data),

    // Delete ebook
    deleteEbook: (isbn: string) => apiClient.delete(`/ebooks/${isbn}`),

    // Update ebook status
    updateStatus: (isbn: string, status: Ebook['status']) =>
        apiClient.put(`/ebooks/${isbn}/status`, { status }),

    updateMetadata: (isbn: string, data: Partial<Ebook>) => 
        apiClient.put(`/ebooks/${isbn}/metadata`, data),

    // Cover management
    getCover: (isbn: string) => apiClient.get(`/ebooks/${isbn}/cover`, { responseType: 'blob' }),
    
    uploadCover: (isbn: string, formData: FormData) => 
        apiClient.post(`/ebooks/${isbn}/cover`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),

    // Content management
    getContent: (isbn: string, filename?: string) =>
        apiClient.get<{ content: string }>(`/ebooks/${isbn}/content`, {
            params: { filename }
        }),

    saveContent: (isbn: string, content: string) =>
        apiClient.post(`/ebooks/${isbn}/content`, { content }),

    // Images management
    uploadImage: (isbn: string, imageId: string, formData: FormData) => 
        apiClient.post(`/ebooks/${isbn}/images/${imageId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),

    uploadImages: (isbn: string, formData: FormData) => 
        apiClient.post(`/ebooks/${isbn}/images/batch`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),

    getImage: (isbn: string, imageId: string) =>
        apiClient.get(`/ebooks/${isbn}/images/${imageId}`, { responseType: 'blob' }),

    listImages: (isbn: string) =>
        apiClient.get<{ images: Array<{ id: string; filename: string; size: number; modified: number; dimensions: { width: number; height: number } | null }> }>(`/ebooks/${isbn}/images`),

    deleteImage: (isbn: string, imageId: string) =>
        apiClient.delete(`/ebooks/${isbn}/images/${imageId}`),

    renameImage: (isbn: string, oldImageId: string, newName: string) =>
        apiClient.put<{ message: string; oldId: string; newId: string; filename: string }>(
            `/ebooks/${isbn}/images/${oldImageId}`,
            { newName }
        ),

    // History
    getHistory: (isbn: string) => apiClient.get<{ history: HistoryFile[] }>(`/ebooks/${isbn}/history`),

    // Validation
    validate: (isbn: string, formData: FormData) =>
        apiClient.post<ValidationResult>(`/ebooks/${isbn}/validate`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),

    validateAccessibility: (isbn: string, formData: FormData) =>
        apiClient.post<ValidationResult>(`/ebooks/${isbn}/validate-accessibility`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        }),

    saveGrammar: (isbn: string, matches: any[], cache: Record<string, any> = {}) => 
        apiClient.post(`/ebooks/${isbn}/grammar`, { matches, cache }),
    getGrammar: (isbn: string) => apiClient.get(`/ebooks/${isbn}/grammar`),

    // EPUB management
    uploadEpub: (isbn: string, epubBlob: Blob) => {
        const formData = new FormData();
        formData.append('epub', epubBlob, 'ebook.epub');
        return apiClient.post<{ message: string, filename: string }>(`/ebooks/${isbn}/epub`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },

    getEpub: (isbn: string) =>
        apiClient.get(`/ebooks/${isbn}/epub`, { responseType: 'blob' }),

    getEpubHistory: (isbn: string) =>
        apiClient.get<{ epubs: EpubFile[] }>(`/ebooks/${isbn}/epubs`),

    downloadEpub: (isbn: string, filename: string) =>
        apiClient.get(`/ebooks/${isbn}/epubs/${filename}`, { responseType: 'blob' }),

    // Style (CSS per ebook)
    getStyle: (isbn: string) => apiClient.get<string>(`/ebooks/${isbn}/style`, { responseType: 'text' }),
    saveStyle: (isbn: string, css: string) => apiClient.put(`/ebooks/${isbn}/style`, { css }),

    // Trash / Recycle bin
    getTrash: () => apiClient.get<{ data: Ebook[] }>('/trash'),
    restoreEbook: (isbn: string) => apiClient.post(`/trash/${isbn}/restore`),
    permanentDelete: (isbn: string) => apiClient.delete(`/trash/${isbn}`),

    // Partilha
    getShares: (isbn: string) => apiClient.get<{ data: ShareUser[] }>(`/ebooks/${isbn}/share`),
    shareEbook: (isbn: string, userId: number) => apiClient.post<{ data: ShareUser[] }>(`/ebooks/${isbn}/share`, { userId }),
    unshareEbook: (isbn: string, userId: number) => apiClient.delete<{ data: ShareUser[] }>(`/ebooks/${isbn}/share/${userId}`),

    // Maintenance
    cleanupHistory: () => apiClient.post<{ deletedCount: number, sizeSavedMB: string }>('/maintenance/cleanup-history'),

    // Presence / edit-lock
    heartbeat: (isbn: string) => apiClient.post<PresenceStatus>(`/ebooks/${isbn}/presence`),
    // keepalive p/ correr no unload; sendBeacon não envia header de auth
    releasePresence: (isbn: string) => {
        const token = getAccessToken();
        fetch(`/api/ebooks/${isbn}/presence`, {
            method: 'DELETE',
            keepalive: true,
            headers: {
                'X-Client-Id': clientId,
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        }).catch(() => { /* best-effort; o TTL liberta o lock */ });
    },
};
