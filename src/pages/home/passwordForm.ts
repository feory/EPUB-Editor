export const MIN_LENGTH = 12; // igual ao servidor (routes/auth.js)

/** Mensagem a mostrar antes de ir ao servidor, ou null se o formulário está válido. */
export function passwordFormError(current: string, next: string, confirm: string): string | null {
    if (!current) return 'Escreve a palavra-passe atual.';
    if (next.length < MIN_LENGTH) return `A nova palavra-passe tem de ter pelo menos ${MIN_LENGTH} caracteres.`;
    if (next === current) return 'A nova palavra-passe tem de ser diferente da atual.';
    if (next !== confirm) return 'A confirmação não coincide com a nova palavra-passe.';
    return null;
}
