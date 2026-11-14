import apiClient from './client';

/** Guias que o administrador editou: { [id]: markdown }. Os que faltam valem pela versão original (no código). */
export const docsApi = {
    list: () => apiClient.get<Record<string, string>>('/docs').then((r) => r.data),
    save: (id: string, content: string) => apiClient.put(`/docs/${id}`, { content }).then((r) => r.data),
    reset: (id: string) => apiClient.delete(`/docs/${id}`).then((r) => r.data),
};
