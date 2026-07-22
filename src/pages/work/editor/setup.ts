import type { Editor } from 'tinymce';
import { cleanEditorDOM } from '../../../utils/html-cleaner';
import { registerEditorIcons } from './icons';
import { SLASH_ITEMS } from './config';
import type { TinyMCEEditor } from './types';

interface SetupDeps {
    setHtmlContent: (content: string) => void;
    isCleaningRef: React.MutableRefObject<boolean>;
    onGrammarClick?: (index: number) => void;
    onSave?: () => void;
    onExport?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    startHtmlEdit: (top: HTMLElement) => void;
    openStyleMenu: (kind: 'para' | 'head') => void;
    onCropImage: (imageId: string) => void;
    wireOverlays: (
        editor: TinyMCEEditor,
        ctx: { blockOf: (n: Node | null) => Element | null; getHiddenBlock: () => Element | null },
    ) => void;
}

/** Constrói o `setup(editor)` do TinyMCE: botões, formatos, marcadores de UI, menus e wiring dos overlays. */
export function createEditorSetup(deps: SetupDeps) {
    const { setHtmlContent, isCleaningRef, onGrammarClick, onSave, onExport, onUndo, onRedo, startHtmlEdit, openStyleMenu, wireOverlays, onCropImage } = deps;

    return (editor: Editor) => {
        editor.addCommand('mceChapterBreak', () => {
            const bookmark = editor.selection.getBookmark(2, true);
            editor.windowManager.open({
                title: 'Capítulo sem Título',
                body: {
                    type: 'panel',
                    items: [{ type: 'input', name: 'title', label: 'Título do capítulo', placeholder: 'Capítulo' }],
                },
                buttons: [
                    { type: 'cancel', text: 'Cancelar' },
                    { type: 'submit', text: 'Inserir', primary: true },
                ],
                onSubmit: (api: { getData: () => { title: string }; close: () => void }) => {
                    const data = api.getData() as { title: string };
                    const safeTitle = (data.title.trim() || 'Capítulo').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    api.close();
                    editor.selection.moveToBookmark(bookmark);
                    const node = editor.selection.getNode();
                    const block = editor.dom.getParent(node, 'p,h1,h2,h3,h4,h5,h6') as HTMLElement | null;
                    // Marcador + parágrafo vazio a seguir, pronto para o conteúdo do capítulo.
                    const html = `<p class="chapter-break" data-title="${safeTitle}"></p><p><br data-mce-bogus="1"></p>`;
                    // Bloco vazio SUBSTITUÍDO (em vez de inserir a seguir) só quando é um <p> comum
                    // — um marcador de capítulo (ex. Ficha Técnica, também vazio, título só via
                    // CSS attr(data-title)) nunca deve ser substituído: cursor lá dentro (ex. no
                    // topo do documento) apagava o capítulo existente em vez de criar um novo antes dele.
                    const isMarker = !!block && /\bchapter-break/.test(block.className);
                    if (block && !isMarker && (block.textContent || '').trim() === '') {
                        editor.dom.setOuterHTML(block, html);
                    } else {
                        editor.insertContent(html);
                    }
                    editor.dispatch('Change');
                    const markers = editor.dom.select('p.chapter-break');
                    const inserted = markers[markers.length - 1];
                    const after = inserted?.nextSibling as HTMLElement | null;
                    if (after && after.nodeName === 'P') editor.selection.setCursorLocation(after, 0);
                    editor.focus();
                    editor.nodeChanged();
                },
            });
        });

        editor.ui.registry.addButton('chapterbreak', {
            icon: 'ps-chapterbreak',
            tooltip: 'Capítulo sem Título',
            onAction: () => editor.execCommand('mceChapterBreak'),
        });

        // Arrastar imagem: criar o blob COM o file.name original (o drop
        // default do TinyMCE gera um nome tipo "imagetools…", perdendo-o).
        // Espelha o file_picker_callback; o images_upload_handler envia depois.
        editor.on('drop', (e: DragEvent) => {
            const files = e.dataTransfer?.files
                ? Array.from(e.dataTransfer.files).filter((f: File) => f.type.startsWith('image/'))
                : [];
            if (files.length === 0) return; // texto / mover interno → TinyMCE trata
            e.preventDefault();
            const rng = editor.getDoc().caretRangeFromPoint?.(e.clientX, e.clientY);
            if (rng) editor.selection.setRng(rng);
            const blobCache = editor.editorUpload.blobCache;
            (files as File[]).forEach((file) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    const blobId = `blobid${Date.now()}${Math.round(Math.random() * 1e6)}`;
                    const blobInfo = blobCache.create(blobId, file, base64, file.name);
                    blobCache.add(blobInfo);
                    editor.insertContent(`<img src="${blobInfo.blobUri()}" alt="${file.name}" />`);
                };
                reader.readAsDataURL(file);
            });
        });

        editor.on('SetContent', () => {
            if (isCleaningRef.current) return;
            const body = editor.getBody();
            const beforeHtml = body.innerHTML;
            cleanEditorDOM(body);
            // Backfill data-image-id before capturing afterHtml so the attribute is
            // included in the state update and present when prepareEpubAssets runs.
            body.querySelectorAll<HTMLImageElement>('img:not([data-image-id])').forEach((img) => {
                const src = img.getAttribute('src');
                if (src && src.includes('/api/ebooks/') && src.includes('/images/')) {
                    const match = src.match(/\/images\/([^/?]+)/);
                    if (match && match[1]) {
                        img.setAttribute('data-image-id', match[1]);
                        img.setAttribute('loading', 'lazy');
                        img.setAttribute('alt', 'Imagem');
                        if (!img.style.maxWidth) img.style.maxWidth = '100%';
                        if (!img.style.height) img.style.height = 'auto';
                    }
                }
            });
            const afterHtml = body.innerHTML;
            // Guard: never propagate empty content — prevents a race where TinyMCE's
            // initial empty <p><br></p> gets cleaned and wipes real content already loaded.
            if (afterHtml !== beforeHtml && afterHtml.trim().length > 0) {
                isCleaningRef.current = true;
                setTimeout(() => {
                    setHtmlContent(afterHtml);
                    isCleaningRef.current = false;
                }, 0);
            }
        });

        editor.on('click', (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const errorSpan = target.closest('.grammar-error-highlight');
            if (errorSpan && onGrammarClick) {
                const index = parseInt(errorSpan.getAttribute('data-error-index') || '-1');
                if (index !== -1) onGrammarClick(index);
            }
        });

        editor.addShortcut('meta+s,ctrl+s', 'Guardar Trabalho', () => onSave?.());
        editor.addShortcut('meta+e,ctrl+e', 'Exportar EPUB', () => onExport?.());

        if (onUndo) {
            editor.addShortcut('meta+z,ctrl+z', 'Desfazer', () => { onUndo(); return false; });
        }
        if (onRedo) {
            editor.addShortcut('meta+shift+z,ctrl+shift+z,meta+y,ctrl+y', 'Refazer', () => { onRedo(); return false; });
        }

        editor.addShortcut('meta+1,ctrl+1', 'Título 1', () => editor.execCommand('FormatBlock', false, 'h1'));
        editor.addShortcut('meta+2,ctrl+2', 'Título 2', () => editor.execCommand('FormatBlock', false, 'h2'));
        editor.addShortcut('meta+3,ctrl+3', 'Título 3', () => editor.execCommand('FormatBlock', false, 'h3'));
        editor.addShortcut('meta+p,ctrl+p', 'Parágrafo Padrão', () => editor.execCommand('FormatBlock', false, 'p'));
        // formatter.apply() sozinho não dispara 'Change' — sem isto o React nunca sincroniza
        // a classe aplicada, perdida ao gravar (mesmo motivo de editor.dispatch('Change') em styleAction).
        editor.addShortcut('meta+i,ctrl+i', 'Com Indentação', () => { editor.formatter.apply('p-indent'); editor.dispatch('Change'); editor.nodeChanged(); });
        editor.addShortcut('meta+t,ctrl+t', 'Parágrafo de Topo', () => { editor.formatter.apply('p-top'); editor.dispatch('Change'); editor.nodeChanged(); });

        editor.on('init', () => {
            // selector (não block): aplica a classe ao bloco existente sem lhe trocar a tag —
            // block:'p' não fazia nada dentro de um <li> (o TinyMCE não troca a tag de um item
            // de lista por um <p>, quebraria a lista), impossibilitando estilo de parágrafo em
            // bullets. selector:'p,li' cobre ambos.
            editor.formatter.register('p-indent', { selector: 'p,li', classes: 'p-indent' });
            editor.formatter.register('p-top', { selector: 'p,li', classes: 'p-top' });
            editor.formatter.register('p-space', { selector: 'p,li', classes: 'p-space' });
            editor.formatter.register('footnote', { selector: 'p,li', classes: 'footnote' });
            editor.formatter.register('drop-cap', { selector: 'p,li', classes: 'drop-cap' });
            editor.formatter.register('p-small', { selector: 'p,li', classes: 'p-small' });
            editor.formatter.register('p-legendas', { selector: 'p,li', classes: 'p-legendas' });
            editor.formatter.register('p-bold', { selector: 'p,li', classes: 'p-bold' });
            editor.formatter.register('p-italic', { selector: 'p,li', classes: 'p-italic' });
            editor.formatter.register('p-bold-italic', { selector: 'p,li', classes: 'p-bold-italic' });
            editor.formatter.register('p-quote', { selector: 'p,li', classes: 'p-quote' });
            editor.formatter.register('p-asterisk', { selector: 'p,li', classes: 'p-asterisk' });
            editor.formatter.register('p-border-top', { selector: 'p,li', classes: 'p-border-top' });
            editor.formatter.register('p-border-bottom', { selector: 'p,li', classes: 'p-border-bottom' });
            editor.formatter.register('p-border-sides', { selector: 'p,li', classes: 'p-border-sides' });
            editor.formatter.register('small-text', { inline: 'small' });
            // Override do formato nativo (senão sai <span style="text-decoration:underline">) —
            // <u> é o que o import de EPUB já produz (reverseUnderline), consistente e sem CSS.
            editor.formatter.register('underline', { inline: 'u' });
            editor.formatter.register('small-caps', { inline: 'span', classes: 'small-caps' });
            editor.formatter.register('box', { block: 'div', classes: 'box', wrapper: true });
            editor.formatter.register('noBreak', { block: 'div', classes: 'noBreak', wrapper: true });
        });

        const setImgAlign = (cls: string) => {
            const node = editor.selection.getNode();
            if (node.nodeName !== 'IMG') return;
            ['img-left', 'img-center', 'img-right'].forEach((c) => editor.dom.removeClass(node, c));
            editor.dom.addClass(node, cls);
            editor.dispatch('Change');
        };
        ([
            ['imgalignleft', 'img-left', 'align-left', 'Imagem à esquerda'],
            ['imgaligncenter', 'img-center', 'align-center', 'Imagem centrada'],
            ['imgalignright', 'img-right', 'align-right', 'Imagem à direita'],
        ] as const).forEach(([name, cls, icon, tooltip]) => {
            editor.ui.registry.addToggleButton(name, {
                icon,
                tooltip,
                onAction: () => setImgAlign(cls),
                onSetup: (api) => {
                    const update = () => {
                        const node = editor.selection.getNode();
                        api.setActive(node.nodeName === 'IMG' && editor.dom.hasClass(node, cls));
                    };
                    editor.on('NodeChange', update);
                    return () => editor.off('NodeChange', update);
                },
            });
        });
        editor.ui.registry.addContextToolbar('imagealign', {
            predicate: (node: HTMLElement) => node.nodeName === 'IMG',
            position: 'node',
            scope: 'node',
            items: 'imgalignleft imgaligncenter imgalignright',
        });

        // Botão direito em cima de uma imagem → "Cortar imagem" (editor de corte, mesmo
        // mecanismo da Galeria: grava sobre o mesmo data-image-id).
        editor.ui.registry.addMenuItem('imagecrop', {
            text: 'Cortar imagem',
            onAction: () => {
                const node = editor.selection.getNode();
                const imageId = node?.nodeName === 'IMG' ? node.getAttribute('data-image-id') : null;
                if (imageId) onCropImage(imageId);
            },
        });

        registerEditorIcons(editor);

        // Botões inline do mini-menu de estilos (toggle por formato)
        ([
            ['psdefault', 'p', 'ps-default', 'Padrão'],
            ['psindent', 'p-indent', 'ps-indent', 'Com Indentação'],
            ['pstop', 'p-top', 'ps-top', 'Espaçamento no Topo'],
            ['psspace', 'p-space', 'ps-space', 'Espaço Extra'],
            ['psquote', 'p-quote', 'ps-quote', 'Citação'],
            ['psh1', 'h1', 'ps-h1', 'Título 1'],
            ['psh2', 'h2', 'ps-h2', 'Título 2'],
            ['psh3', 'h3', 'ps-h3', 'Título 3'],
        ] as const).forEach(([name, format, icon, tooltip]) => {
            editor.ui.registry.addToggleButton(name, {
                icon,
                tooltip,
                onAction: () => {
                    editor.formatter.toggle(format);
                    if (/^h[123]$/.test(format)) syncChapterMarker();
                    editor.dispatch('Change'); // sem isto o React não sincroniza a classe aplicada
                    editor.nodeChanged();
                },
                onSetup: (api) => {
                    editor.formatter.formatChanged(format, (active) => api.setActive(active));
                    return () => {};
                },
            });
        });

        // Botão "Mais estilos" (⋮ vertical) → abre um overlay React em 2 colunas (fora do TinyMCE,
        // que só faz dropdowns de 1 coluna). Fica no canto esquerdo do mini-menu (1º item).
        ([['psmorepara', 'para'], ['psmorehead', 'head']] as const).forEach(([name, kind]) => {
            editor.ui.registry.addButton(name, {
                icon: 'ps-vdots',
                onAction: () => openStyleMenu(kind),
            });
        });

        // Segundo clique no mesmo bloco oculta o mini-menu (toggle)
        let hiddenBlock: Element | null = null;
        let prevBlock: Element | null = null;
        const blockOf = (node: Node | null) =>
            node ? (editor.dom.getParent(node, 'p,h1,h2,h3,h4,h5,h6') as Element | null) : null;
        editor.on('click', (e: MouseEvent) => {
            const block = blockOf(e.target as Node);
            if (block && block === prevBlock) {
                // Mesmo bloco: alternar visibilidade. Seleção não se move → forçar reavaliação.
                hiddenBlock = hiddenBlock === block ? null : block;
                editor.nodeChanged();
            } else {
                hiddenBlock = null; // bloco novo: o NodeChange natural do clique já reavalia
            }
            prevBlock = block;
        });

        // Contorno do bloco ativo: marcador de UI puro `data-mce-psactive`.
        // addTempAttr → o serializer nunca o emite (getContent/autosave/EPUB saem limpos).
        editor.on('PreInit', () => {
            editor.serializer.addTempAttr('data-mce-psactive');
            editor.serializer.addTempAttr('data-mce-empty'); // placeholder de bloco vazio (nunca exporta)
            editor.serializer.addTempAttr('data-mce-htmledit'); // bloco escondido durante edição de HTML inline
        });
        // Limpa qualquer marcador stale no DOM após o load inicial (uma vez).
        editor.on('init', () => editor.dom.select('[data-mce-psactive]').forEach((el: HTMLElement) => editor.dom.setAttrib(el, 'data-mce-psactive', null)));
        // Placeholder: marca o <p> vazio focado (CSS mostra "Escreve algo…" via ::before).
        const refreshEmptyMarker = () => {
            editor.dom.select('[data-mce-empty]').forEach((el: HTMLElement) => editor.dom.setAttrib(el, 'data-mce-empty', null));
            if (!editor.hasFocus()) return;
            const block = blockOf(editor.selection.getNode()) as HTMLElement | null;
            if (block && block.nodeName === 'P' && !/\bchapter-break/.test(block.className)
                && !(block.textContent || '').replace(/\u00a0/g, '').trim() && !block.querySelector('img')) {
                editor.dom.setAttrib(block, 'data-mce-empty', '1');
            }
        };
        editor.on('NodeChange', () => {
            // Limpar TODOS os marcadores: Enter no início de um bloco marcado faz o
            // TinyMCE clonar o data-mce-psactive para os <p> criados — uma só ref não os apanha
            editor.dom.select('[data-mce-psactive]').forEach((el: HTMLElement) => editor.dom.setAttrib(el, 'data-mce-psactive', null));
            // Só marcar com foco real — colocação programática do cursor (entrada/troca de capítulo) não conta
            if (editor.hasFocus()) {
                const block = blockOf(editor.selection.getNode());
                if (block && block !== hiddenBlock && block !== editor.getBody()) {
                    editor.dom.setAttrib(block, 'data-mce-psactive', '1');
                }
            }
            refreshEmptyMarker();
        });
        editor.on('input', refreshEmptyMarker); // ao escrever/apagar, atualizar o placeholder

        // Converter parágrafo→título remove os estilos de parágrafo associados.
        // p-center (alinhamento) mantém-se — é válido num título.
        // ponytail: NodeChange é o choke point comum a todas as vias de conversão
        // (botões, menu "...", atalhos, markdown); estas classes nunca são legítimas num heading.
        const PARA_STYLE_CLASSES = [
            'p-indent', 'p-top', 'p-space', 'p-small', 'p-bold', 'p-italic', 'p-bold-italic', 'p-quote', 'p-legendas',
            'p-non-indent', 'footnote', 'drop-cap', 'alinea',
            'p-border-top', 'p-border-bottom', 'p-border-sides',
        ];
        editor.on('NodeChange', () => {
            if (!editor.hasFocus()) return;
            const block = blockOf(editor.selection.getNode());
            if (block && /^H[1-6]$/.test(block.nodeName)) {
                PARA_STYLE_CLASSES.forEach((c) => block.classList.remove(c));
            }
        });

        // "Editor também": criar um h1/h2 insere o marcador de capítulo antes dele
        // (é o marcador, não o heading, que parte capítulos). Só em EVENTOS de conversão
        // (atalho/botão/menu) — nunca no NodeChange — para que apagar o marcador à mão
        // (h2 vira subtítulo dentro do capítulo) NÃO seja re-inserido ao clicar.
        function syncChapterMarker() {
            const block = blockOf(editor.selection.getNode()) as HTMLElement | null;
            if (!block) return;
            const prev = block.previousElementSibling as HTMLElement | null;
            const prevIsMarker = !!prev && prev.nodeName === 'P' && /\bchapter-break-h[12]\b/.test(prev.className);
            if (/^H[12]$/.test(block.nodeName)) {
                const level = block.nodeName.toLowerCase();
                const title = (block.textContent || '').replace(/\s+/g, ' ').trim();
                if (prevIsMarker) {
                    editor.dom.setAttrib(prev, 'class', `chapter-break-${level}`);
                    editor.dom.setAttrib(prev, 'data-title', title);
                } else {
                    const marker = editor.dom.create('p', { class: `chapter-break-${level}`, 'data-title': title });
                    block.parentNode!.insertBefore(marker, block);
                }
            } else if (prevIsMarker) {
                editor.dom.remove(prev); // heading despromovido → remover o seu marcador
            }
            editor.dispatch('Change');
        }
        editor.on('ExecCommand', (e) => {
            if (e.command === 'FormatBlock' && /^h[123]$/i.test(String((e as { value?: unknown }).value || ''))) syncChapterMarker();
        });
        // Dropdown "styles" do toolbar aplica o formato via formatter (FormatApply/FormatRemove),
        // não via comando FormatBlock → o listener acima não o apanha. Cobrir esses eventos para
        // criar/remover o marcador de capítulo também a partir do menu de estilos. Idempotente
        // (pode duplicar com o ExecCommand em atalhos/slash — syncChapterMarker é seguro a repetir).
        const onFormatChange = (e: { format?: string }) => {
            const f = String(e.format || '');
            if (/^h[123]$/.test(f) || f === 'p') syncChapterMarker();
        };
        editor.on('FormatApply', onFormatChange);
        editor.on('FormatRemove', onFormatChange);

        // Marcador de capítulo é só um separador visual (o título vive no heading a seguir).
        // Bloquear escrita dentro dele: caracteres e Enter. Permite navegação, apagar (remove
        // o marcador) e atalhos (Ctrl/Cmd/Alt).
        editor.on('keydown', (e: KeyboardEvent) => {
            const block = blockOf(editor.selection.getNode()) as HTMLElement | null;
            if (!block || !/\bchapter-break/.test(block.className)) return;
            if (e.key === 'Enter' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) {
                e.preventDefault();
            }
        });

        // Menu "/" (estilo Notion): escrever "/" abre lista p/ inserir/converter bloco.
        // Reaproveita os formats/comandos já existentes; FormatBlock h1-3 dispara syncChapterMarker.
        editor.ui.registry.addAutocompleter('slashmenu', {
            trigger: '/',
            minChars: 0,
            columns: 1,
            fetch: (pattern: string) => Promise.resolve(
                SLASH_ITEMS.filter((i) => i.text.toLowerCase().includes(pattern.toLowerCase()))
                    .map((i) => ({ type: 'autocompleteitem' as const, value: i.value, text: i.text, icon: i.icon })),
            ),
            onAction: (api: { hide: () => void }, rng: Range, value: string) => {
                editor.selection.setRng(rng);
                editor.execCommand('Delete'); // remove o "/pattern"
                api.hide();
                if (/^h[123]$/.test(value) || value === 'p') editor.execCommand('FormatBlock', false, value);
                else if (value === 'image') editor.execCommand('mceImage');
                else if (value === 'hr') editor.execCommand('mceInsertContent', false, '<hr>');
                else editor.formatter.apply(value); // p-quote, p-small, footnote
                editor.focus();
            },
        });
        // Editar o texto de um h1/h2 atualiza ao vivo o data-title do marcador
        // que o antecede (o rótulo "QUEBRA DE CAPÍTULO — …"). Só ATUALIZA um
        // marcador existente — nunca insere/remove — logo sem clobber.
        editor.on('input', () => {
            const block = blockOf(editor.selection.getNode()) as HTMLElement | null;
            if (!block || !/^H[12]$/.test(block.nodeName)) return;
            const prev = block.previousElementSibling as HTMLElement | null;
            if (prev && prev.nodeName === 'P' && /\bchapter-break-h[12]\b/.test(prev.className)) {
                prev.setAttribute('data-title', (block.textContent || '').replace(/\s+/g, ' ').trim());
            }
        });

        // Barra de estado: mostrar o CSS do bloco selecionado (seletor de classes
        // + style inline) à esquerda do element-path. ponytail: injeta um elemento
        // próprio na .tox-statusbar e atualiza-o no NodeChange (o element-path do
        // tema é re-renderizado e não dá para customizar o label).
        let cssInfoEl: HTMLElement | null = null;
        const updateCssInfo = () => {
            if (!cssInfoEl) return;
            const block = blockOf(editor.selection.getNode());
            if (block && /^(P|H[1-6])$/.test(block.nodeName)) {
                const tag = block.nodeName.toLowerCase();
                const cls = (block.getAttribute('class') || '').split(/\s+/)
                    .filter((c) => c && !c.startsWith('mce') && !c.startsWith('data-mce'))
                    .map((c) => '.' + c).join('');
                const style = (block.getAttribute('style') || '').trim();
                cssInfoEl.textContent = tag + cls + (style ? ` { ${style} }` : '');
            } else {
                cssInfoEl.textContent = '';
            }
        };
        editor.on('init', () => {
            const sb = editor.getContainer()?.querySelector('.tox-statusbar');
            if (sb) {
                cssInfoEl = document.createElement('div');
                cssInfoEl.title = 'CSS do bloco selecionado';
                cssInfoEl.style.cssText = 'flex:1;min-width:0;padding:0 8px;font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                sb.insertBefore(cssInfoEl, sb.firstChild);
            }
            updateCssInfo();
        });
        editor.on('NodeChange', updateCssInfo);

        // Botão "Editar HTML" no mini-menu → abre a edição inline do bloco de topo.
        editor.ui.registry.addButton('edithtml', {
            icon: 'ps-htmledit',
            tooltip: 'Editar HTML',
            onAction: () => {
                const block = blockOf(editor.selection.getNode()) as HTMLElement | null;
                if (!block) return;
                const body = editor.getBody();
                let top = block;
                while (top.parentElement && top.parentElement !== body) top = top.parentElement;
                startHtmlEdit(top);
            },
        });
        // Alinhamento agrupado num único dropdown (esquerda/centro/direita)
        editor.ui.registry.addMenuButton('blockalignmenu', {
            icon: 'align-left',
            tooltip: 'Alinhamento',
            fetch: (callback) => callback([
                { type: 'menuitem', text: 'Esquerda', icon: 'align-left', onAction: () => editor.execCommand('JustifyLeft') },
                { type: 'menuitem', text: 'Centro', icon: 'align-center', onAction: () => editor.execCommand('JustifyCenter') },
                { type: 'menuitem', text: 'Direita', icon: 'align-right', onAction: () => editor.execCommand('JustifyRight') },
            ]),
        });
        // Em parágrafo: "Mais estilos" (⋮) no canto esquerdo, alinhamento logo à direita, depois estilos inline.
        editor.ui.registry.addContextToolbar('parastyles', {
            // Só com o cursor colapsado — em seleção de texto mostra-se o bubble, não o mini-menu.
            // Também em <li> (blockOf não inclui 'li' — usado pelo sistema de pega/+ que não se
            // estende a listas; aqui só precisamos do mini-menu de estilos, por isso getParent
            // próprio em vez de alargar blockOf), para dar acesso a p-top/p-quote/etc. em bullets.
            predicate: (node: Node) => {
                const block = blockOf(node) || editor.dom.getParent(node, 'li');
                return !!block && (block.nodeName === 'P' || block.nodeName === 'LI') && block !== hiddenBlock && editor.selection.isCollapsed();
            },
            position: 'node',
            scope: 'node',
            items: 'psmorepara blockalignmenu psdefault psindent pstop psspace psquote edithtml',
        });
        // Em título: "Mais estilos" (⋮) no canto esquerdo, alinhamento logo à direita, depois estilos inline.
        editor.ui.registry.addContextToolbar('headingstyles', {
            predicate: (node: Node) => {
                const block = blockOf(node);
                return !!block && /^H[1-6]$/.test(block.nodeName) && block !== hiddenBlock && editor.selection.isCollapsed();
            },
            position: 'node',
            scope: 'node',
            items: 'psmorehead blockalignmenu psh1 psh2 psh3 edithtml',
        });

        editor.ui.registry.addToggleButton('smalltext', {
            icon: 'ps-smalltext',
            tooltip: 'Texto Pequeno (small)',
            onAction: () => editor.formatter.toggle('small-text'),
            onSetup: (api) => {
                editor.formatter.formatChanged('small-text', (active) => api.setActive(active));
                return () => {};
            },
        });

        editor.ui.registry.addToggleButton('smallcaps', {
            icon: 'ps-smallcaps',
            tooltip: 'Versaletes (small-caps)',
            onAction: () => {
                if (editor.formatter.match('small-caps')) {
                    editor.formatter.remove('small-caps');
                    return;
                }
                const text = editor.selection.getContent({ format: 'text' });
                if (!text) {
                    editor.formatter.apply('small-caps');
                    return;
                }
                const cased = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
                editor.selection.setContent(`<span class="small-caps">${editor.dom.encode(cased)}</span>`);
            },
            onSetup: (api) => {
                editor.formatter.formatChanged('small-caps', (active) => api.setActive(active));
                return () => {};
            },
        });

        editor.ui.registry.addToggleButton('box', {
            icon: 'ps-box',
            tooltip: 'Envolver em caixa com borda',
            onAction: () => {
                const selectedNode = editor.selection.getNode();
                const existingBox = editor.dom.getParent(selectedNode, '.box') as HTMLElement | null;
                if (existingBox) {
                    editor.dom.setOuterHTML(existingBox, existingBox.innerHTML);
                } else {
                    const html = editor.selection.getContent({ format: 'html' });
                    if (html.trim()) {
                        editor.selection.setContent(`<div class="box">${html}</div>`);
                    }
                }
                editor.dispatch('Change');
            },
            onSetup: (api) => {
                const handler = () => {
                    const node = editor.selection.getNode();
                    api.setActive(!!editor.dom.getParent(node, '.box'));
                };
                editor.on('NodeChange', handler);
                return () => editor.off('NodeChange', handler);
            },
        });

        editor.ui.registry.addToggleButton('noBreak', {
            icon: 'ps-union',
            tooltip: 'União entre título e o parágrafo',
            onAction: () => {
                if (editor.formatter.match('noBreak')) {
                    editor.formatter.remove('noBreak');
                } else {
                    editor.formatter.apply('noBreak');
                }
                editor.dispatch('Change');
            },
            onSetup: (api) => {
                const handler = () => api.setActive(!!editor.formatter.match('noBreak'));
                editor.on('NodeChange', handler);
                return () => editor.off('NodeChange', handler);
            },
        });

        // Overlays estilo Notion (fora do iframe): instalar reação ao editor.
        wireOverlays(editor, { blockOf, getHiddenBlock: () => hiddenBlock });
    };
}
