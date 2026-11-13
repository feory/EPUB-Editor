import apiClient from './client';

/** O que o Painel vê da OpenRouter: nunca a chave inteira (só os últimos 4 caracteres). */
export interface AiSettings {
    configured: boolean;
    keyConfigured: boolean;
    keyHint: string | null;
    model: string | null;
}

export interface AiModel {
    id: string;
    name: string;
    /** Aceita imagens (precisa disto o texto alternativo das imagens). */
    vision: boolean;
    contextLength: number | null;
    promptPerMillion: number;
    completionPerMillion: number;
}

export const aiAdminApi = {
    getSettings: () => apiClient.get<AiSettings>('/ai/settings').then((r) => r.data),
    /** `apiKey` guarda a chave; `clearKey` apaga a do Painel; `model` ('' apaga) guarda o modelo. */
    saveSettings: (body: { apiKey?: string; clearKey?: boolean; model?: string }) => apiClient.put<AiSettings>('/ai/settings', body).then((r) => r.data),
    testConnection: () => apiClient.post<{ ok: boolean; message: string }>('/ai/settings/test').then((r) => r.data),
    getModels: () => apiClient.get<{ models: AiModel[] }>('/ai/models').then((r) => r.data.models),
};
