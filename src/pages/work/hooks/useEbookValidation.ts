import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ebooksApi } from '../../../api/ebooks-api';
import type { ValidationResult } from '../../../api/ebooks-api';
import { generateEpubBlob } from '../../../services/epub-service';
import { validateFootnotes, type ValidationReport } from '../../../services/footnote-validator';
import { validateLinks, type LinkReport } from '../../../services/link-validator';

type ValidationConfig = {
    type: 'footnotes' | 'epub' | 'accessibility' | 'links';
    needsEpub: boolean;
    startMessage: string;
    successMessage: string;
    errorMessage: string;
    warningMessage: (count: number) => string;
    validMessage: (count: number) => string;
};

interface UseEbookValidationOptions {
    isbn: string | undefined;
    getSyncedHtmlContent: () => string;
    prepareEpubAssets: (html: string) => Promise<{ metadata: any; imageMap: Map<string, Blob>; coverBlob: Blob | null }>;
    customCss: string;
    showNotification: (type: string, message: string, duration?: number) => string;
    hideNotification: (id: string) => void;
}

export function useEbookValidation({
    isbn,
    getSyncedHtmlContent,
    prepareEpubAssets,
    customCss,
    showNotification,
    hideNotification,
}: UseEbookValidationOptions) {
    const [validationResults, setValidationResults] = useState<ValidationResult | null>(null);
    const [footnoteValidation, setFootnoteValidation] = useState<ValidationReport | null>(null);
    const [linkValidation, setLinkValidation] = useState<LinkReport | null>(null);

    const performValidation = useCallback(async (config: ValidationConfig) => {
        try {
            const html = getSyncedHtmlContent();
            // As três validações são mutuamente exclusivas no painel — limpar todas
            // e preencher só a do tipo atual.
            setValidationResults(null);
            setFootnoteValidation(null);
            setLinkValidation(null);

            if (config.needsEpub) {
                // Notificação persistente (duration 0) durante a geração + validação
                // (ACE/epubcheck demoram > 3s); fechada quando chega o resultado.
                const pendingId = showNotification('info', config.startMessage, 0);

                let validationData: any;
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

                const totalIssues = validationData.errors.length + validationData.warnings.length;

                if (totalIssues === 0) {
                    showNotification('success', config.successMessage);
                } else {
                    setValidationResults(validationData);
                    if (validationData.valid) {
                        showNotification('info', config.validMessage(totalIssues));
                    } else {
                        showNotification('warning', config.warningMessage(validationData.errors.length));
                    }
                }
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
    }, [getSyncedHtmlContent, prepareEpubAssets, customCss, isbn, showNotification, hideNotification]);

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
        await performValidation({
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
        await performValidation({
            type: 'accessibility',
            needsEpub: true,
            startMessage: 'A validar acessibilidade WCAG...',
            successMessage: 'EPUB acessível! Conforme WCAG.',
            errorMessage: 'Falha ao validar acessibilidade.',
            warningMessage: (totalIssues) => `${totalIssues} problema(s) de acessibilidade encontrado(s).`,
            validMessage: (totalIssues) => `${totalIssues} recomendação(ões) de acessibilidade.`,
        });
    }, [performValidation]);

    return {
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
