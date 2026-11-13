import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ebooksApi } from '../../../api/ebooks-api';
import type { ValidationResult } from '../../../api/ebooks-api';
import { generateEpubBlob } from '../../../services/export/epub-service';
import { validateFootnotes, type ValidationReport } from '../../../services/validation/footnote-validator';
import { validateLinks, type LinkReport } from '../../../services/validation/link-validator';
import type { BookMetadata } from '../../../services/export/epub-service';
import { digestValidation, digestFootnotes, digestLinks, type ValidationDigest, type ValidationKind } from '../../../utils/validation-digest';
import type { NotificationType } from '../../../context/NotificationContext';

type ValidationConfig = {
    type: 'footnotes' | 'epub' | 'accessibility' | 'links';
    needsEpub: boolean;
    startMessage: string;
    successMessage: string;
    errorMessage: string;
    warningMessage: (count: number) => string;
    validMessage: (count: number) => string;
    /** Só devolve o resultado: não o põe no painel de validação nem avisa (quem pede, como o assistente de IA, mostra-o à sua maneira). */
    silent?: boolean;
};

interface UseEbookValidationOptions {
    isbn: string | undefined;
    getLatestHtmlContent: () => string;
    prepareEpubAssets: (html: string) => Promise<{ metadata: BookMetadata; imageMap: Map<string, Blob>; coverBlob: Blob | null }>;
    customCss: string;
    showNotification: (type: NotificationType, message: string, duration?: number) => string;
    hideNotification: (id: string) => void;
}

export function useEbookValidation({
    isbn,
    getLatestHtmlContent,
    prepareEpubAssets,
    customCss,
    showNotification,
    hideNotification,
}: UseEbookValidationOptions) {
    const [validationResults, setValidationResults] = useState<ValidationResult | null>(null);
    const [footnoteValidation, setFootnoteValidation] = useState<ValidationReport | null>(null);
    const [linkValidation, setLinkValidation] = useState<LinkReport | null>(null);

    const performValidation = useCallback(async (config: ValidationConfig): Promise<ValidationResult | null> => {
        try {
            const html = getLatestHtmlContent();
            // As três validações são mutuamente exclusivas no painel — limpar todas
            // e preencher só a do tipo atual.
            if (!config.silent) {
                setValidationResults(null);
                setFootnoteValidation(null);
                setLinkValidation(null);
            }

            if (config.needsEpub) {
                // Notificação persistente (duration 0) durante a geração + validação
                // (ACE/epubcheck demoram > 3s); fechada quando chega o resultado.
                const pendingId = showNotification('info', config.startMessage, 0);

                let validationData: ValidationResult;
                try {
                    const { metadata } = await prepareEpubAssets(html);
                    const blob = await generateEpubBlob(html, metadata, customCss);

                    const fd = new FormData();
                    fd.append('epub', blob, 'check.epub');

                    if (config.type === 'epub') {
                        validationData = (await ebooksApi.validate(isbn!, fd)).data;
                    } else {
                        validationData = (await ebooksApi.validateAccessibility(isbn!, fd)).data;
                    }
                } finally {
                    hideNotification(pendingId);
                }

                if (config.silent) return validationData;
                const totalIssues = validationData.errors.length + validationData.warnings.length;

                if (totalIssues === 0) {
                    showNotification('success', config.successMessage);
                } else {
                    setValidationResults(validationData);
                    if (validationData.valid) {
                        showNotification('info', config.validMessage(totalIssues));
                    } else {
                        showNotification('error', config.warningMessage(validationData.errors.length));
                    }
                }
                return validationData;
            } else if (config.type === 'links') {
                const linkResults = validateLinks(html);
                if (linkResults.issues.length === 0) showNotification('success', config.successMessage);
                else setLinkValidation(linkResults);
            } else {
                const fnResults = validateFootnotes(html);
                if (fnResults.issues.length === 0) showNotification('success', config.successMessage);
                else setFootnoteValidation(fnResults);
            }
        } catch (error) {
            console.error(error);
            showNotification('error', config.errorMessage);
        }
        return null;
    }, [getLatestHtmlContent, prepareEpubAssets, customCss, isbn, showNotification, hideNotification]);

    const validateMutation = useMutation({
        mutationFn: async () => {
            await performValidation({
                type: 'footnotes',
                needsEpub: false,
                startMessage: '',
                successMessage: 'Nenhum problema encontrado nas notas de rodapé.',
                errorMessage: 'Falha ao validar notas de rodapé.',
                warningMessage: () => '',
                validMessage: () => '',
            });
        },
    });

    const handleValidateEpub = useCallback(async () => {
        return performValidation({
            type: 'epub',
            needsEpub: true,
            startMessage: 'A validar conformidade EPUB 3.3...',
            successMessage: 'Epub conforme! Nenhum erro encontrado',
            errorMessage: 'Falha ao validar EPUB.',
            warningMessage: (errorCount) => `EPUB não conforme: ${errorCount} erro(s) encontrado(s).`,
            validMessage: (totalIssues) => `EPUB conforme com ${totalIssues} aviso(s).`,
        });
    }, [performValidation]);

    const handleValidateLinks = useCallback(async () => {
        await performValidation({
            type: 'links',
            needsEpub: false,
            startMessage: '',
            successMessage: 'Nenhum link com problemas encontrado.',
            errorMessage: 'Falha ao validar links.',
            warningMessage: () => '',
            validMessage: () => '',
        });
    }, [performValidation]);

    const handleValidateAccessibility = useCallback(async () => {
        return performValidation({
            type: 'accessibility',
            needsEpub: true,
            startMessage: 'A validar acessibilidade WCAG...',
            successMessage: 'EPUB acessível! Conforme WCAG.',
            errorMessage: 'Falha ao validar acessibilidade.',
            warningMessage: (totalIssues) => `${totalIssues} problema(s) de acessibilidade encontrado(s).`,
            validMessage: (totalIssues) => `${totalIssues} recomendação(ões) de acessibilidade.`,
        });
    }, [performValidation]);

    /** Corre uma validação sem mexer no painel de validação e devolve o resumo (null se falhou). Para o assistente de IA. */
    const runValidation = useCallback(async (kind: ValidationKind): Promise<ValidationDigest | null> => {
        if (kind === 'footnotes') return digestFootnotes(validateFootnotes(getLatestHtmlContent()));
        if (kind === 'links') return digestLinks(validateLinks(getLatestHtmlContent()));
        const result = await performValidation({
            type: kind,
            needsEpub: true,
            silent: true,
            startMessage: kind === 'epub' ? 'A validar conformidade EPUB 3.3...' : 'A validar acessibilidade WCAG...',
            successMessage: '',
            errorMessage: kind === 'epub' ? 'Falha ao validar EPUB.' : 'Falha ao validar acessibilidade.',
            warningMessage: () => '',
            validMessage: () => '',
        });
        return result ? digestValidation(result, kind) : null;
    }, [performValidation, getLatestHtmlContent]);

    return {
        runValidation,
        validationResults,
        setValidationResults,
        footnoteValidation,
        setFootnoteValidation,
        linkValidation,
        setLinkValidation,
        isValidating: validateMutation.isPending,
        handleValidate: useCallback(() => validateMutation.mutate(), [validateMutation]),
        handleValidateEpub,
        handleValidateAccessibility,
        handleValidateLinks,
    };
}
