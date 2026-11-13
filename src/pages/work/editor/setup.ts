import type { Editor } from 'tinymce';
import { isIndiceChapterTitle, entryIndexOf } from '../../../utils/indice-links';
import { MANUAL_ANCHOR_CLASS, manualAnchorHtml, newManualAnchorId } from '../../../utils/indice-marker';
import { CONTAINER_SELECTOR } from '../../../utils/containers';
import { planChapterMarkers, isLevelMarkerClass } from '../../../utils/chapters';
import { registerEditorIcons } from './icons';
import { SLASH_ITEMS, PARAGRAPH_QUICK_STYLES, QUICKBARS_SELECTION_TOOLBAR } from './config';
import type { TinyMCEEditor } from './types';
import { editBlocks } from './blockEdit';
import { BOX_VARIANTS } from './boxProps';
import { inspectBlock, applyBlockEdit, createBlockWatcher, TEXT_BLOCK_SELECTOR, type BlockInfo } from './blockEditing';
import { tinymceEditorLike } from './blockEditingTinymce';
import { attachActiveBlock, type ActiveBlock } from './activeBlock';
import { registerBlockFormats, registeredCharStyles, toggleCharStyle } from './formats';
import { charStyles } from '../../../utils/user-styles';
import { HEADING_STRIPPED_CLASSES } from '../../../utils/editor-classes';
import { blockCssInfo } from './cssInfo';
import { registerImageTools } from './imageTools';
import { MARK, registerEphemeralMarks } from './ephemeral';
import { selectedTopBlocks } from './selectedBlock';
import type { SelectedBlocks } from '../ai/aiSelection';

export interface SetupLive {
    onBlockChange?: (info: BlockInfo) => void;      // caixa e bloco de texto sob o cursor (painel lateral)
    aiOpen?: boolean;                               // painel da IA aberto: ao abrir, nenhum bloco fica ativo nem selecionado
    aiScope?: boolean;                              // painel da IA aberto e limitado aos blocos selecionados → destacá-los no editor
    onSelectedBlock?: (blocks: SelectedBlocks | null) => void; // blocos de topo de texto onde está o cursor/a seleção (assistente de IA: "só estes blocos")
    ebookLabel: string;                             // título do ebook no canto direito da barra de estado
    onToggleFocusMode?: () => void;
    onTogglePrintPdf?: () => void;
    onToggleAi?: () => void;
    showPrintPdfPanel?: boolean;                    // painel de PDF aberto → botão "Ver PDF" ativo
    textPanelOpen?: boolean;                        // painel "Editor de Texto" aberto → a barra da seleção esconde-se
    chapters: { title: string; level: string }[];   // capítulos do livro + índice do aberto (botão "Ligar a capítulo…")
    activeChapterIndex: number;
}

interface SetupDeps {
    onGrammarClick?: (index: number) => void;
    onSave?: () => void;
    onExport?: () => void;
    startHtmlEdit: (top: HTMLElement) => void;
    openStyleMenu: (kind: 'para' | 'head') => void;
    openIndiceLinkPanel: (pIndex: number, currentTarget: string) => void; // '' = entrada sem ligação
    onCropImage: (imageId: string) => void;
    onAddComment?: (anchorId: string) => void;
    openPanel: (panel: 'box' | 'text') => void;   // painel lateral de edição: 'box' = bloco, 'text' = texto selecionado
    // Props que mudam a cada render, lidas por ref: setup() só corre 1x no mount, uma prop direta ficava presa à
    // closure desse 1.º render (livro ainda vazio nessa altura) e nunca via as edições seguintes.
    live: React.MutableRefObject<SetupLive>;
    wireOverlays: (
        editor: TinyMCEEditor,
        ctx: { blockOf: (n: Node | null) => Element | null; activeBlock: ActiveBlock },
    ) => void;
}

/** Constrói o `setup(editor)` do TinyMCE: botões, formatos, marcadores de UI, menus e wiring dos overlays. */
export function createEditorSetup(deps: SetupDeps) {
    const { onGrammarClick, onSave, onExport, startHtmlEdit, openStyleMenu, openIndiceLinkPanel,
        live, wireOverlays, onCropImage, onAddComment, openPanel } = deps;

    return (editor: Editor) => {
        // Ação de menu/atalho como edição de bloco (blockEdit.ts): passo de undo + change + nodeChanged.
        const undoable = (fn: () => void) => () => editBlocks(editor, fn);
        registerEphemeralMarks(editor); // marcas de UI que o serializer nunca emite (ephemeral.ts)
        // Âncora manual no cursor: span.manual-anchor vazio (destino de ligações do Índice, ver
        // findSubtitles em indice-links.ts). id único pela hora (sem varrer o livro todo).
        editor.addCommand('mceInsertAnchor', () => {
            const bookmark = editor.selection.getBookmark(2, true);
            const suggested = (editor.selection.getNode()?.textContent ?? '').trim().slice(0, 60);
            editor.windowManager.open({
                title: 'Âncora',
                body: { type: 'panel', items: [{ type: 'input', name: 'label', label: 'Nome da âncora', placeholder: suggested || 'Âncora' }] },
                buttons: [{ type: 'cancel', text: 'Cancelar' }, { type: 'submit', text: 'Inserir', primary: true }],
                onSubmit: (api: { getData: () => { label: string }; close: () => void }) => {
                    const label = api.getData().label.trim() || suggested || 'Âncora';
                    api.close();
                    editor.selection.moveToBookmark(bookmark);
                    editBlocks(editor, () => {
                        editor.insertContent(manualAnchorHtml(newManualAnchorId(), label));
                        editor.focus();
                    });
                },
            });
        });
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
                    // Marcador + parágrafo vazio a seguir, pronto para o conteúdo do capítulo.
                    const html = `<p class="chapter-break" data-title="${safeTitle}"></p><p><br data-mce-bogus="1"></p>`;
                    // Sempre INSERIDO no cursor (nunca substitui um bloco existente): um bloco
                    // vazio "por perto" do cursor podia na verdade ser o 1º parágrafo do capítulo
                    // SEGUINTE (ex. Ficha Técnica começa com uma linha em branco antes do texto) —
                    // substituí-lo "roubava" o conteúdo desse capítulo para o novo marcador.
                    editBlocks(editor, () => {
                        editor.insertContent(html);
                        const markers = editor.dom.select('p.chapter-break');
                        const inserted = markers[markers.length - 1];
                        const after = inserted?.nextSibling as HTMLElement | null;
                        if (after && after.nodeName === 'P') editor.selection.setCursorLocation(after, 0);
                        editor.focus();
                    });
                },
            });
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
                    // 5º arg (filename) obrigatório — ver comentário equivalente em WorkEditor.tsx
                    // (file_picker_callback): sem ele o TinyMCE duplica a extensão do ficheiro.
                    const blobInfo = blobCache.create(blobId, file, base64, file.name, file.name);
                    blobCache.add(blobInfo);
                    editor.insertContent(`<img src="${blobInfo.blobUri()}" alt="${file.name}" />`);
                };
                reader.readAsDataURL(file);
            });
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

        // ⌘Z/⌘⇧Z sem override: trata deles o undoManager do TinyMCE, o mesmo dos botões da
        // toolbar. Estavam ligados a uma 2ª pilha de histórico na app, com outro âmbito e outra
        // granularidade — botão e atalho desfaziam coisas diferentes (ver contentReducer.ts).

        editor.addShortcut('meta+1,ctrl+1', 'Título 1', () => editor.execCommand('FormatBlock', false, 'h1'));
        editor.addShortcut('meta+2,ctrl+2', 'Título 2', () => editor.execCommand('FormatBlock', false, 'h2'));
        editor.addShortcut('meta+3,ctrl+3', 'Título 3', () => editor.execCommand('FormatBlock', false, 'h3'));
        editor.addShortcut('meta+p,ctrl+p', 'Parágrafo Padrão', () => editor.execCommand('FormatBlock', false, 'p'));
        // formatter.apply() sozinho não dispara 'Change' — sem isto o React nunca sincroniza
        // a classe aplicada, perdida ao gravar (mesmo motivo de editor.dispatch('Change') em styleAction).
        editor.addShortcut('meta+i,ctrl+i', 'Com Indentação', undoable(() => editor.formatter.toggle('p-indent')));
        editor.addShortcut('meta+t,ctrl+t', 'Parágrafo de Topo', undoable(() => editor.formatter.toggle('p-top')));

        registerBlockFormats(editor);
        registerImageTools(editor);

        // Botão direito em cima de uma imagem → "Recorte" (corte, mesmo mecanismo da
        // Galeria: grava sobre o mesmo data-image-id). Grupo dinâmico (addContextMenu): só
        // aparece quando o nó clicado é mesmo a imagem.
        editor.ui.registry.addMenuItem('imagecrop-item', {
            text: 'Recorte',
            icon: 'crop',
            onAction: () => {
                const node = editor.selection.getNode();
                const imageId = node?.nodeName === 'IMG' ? node.getAttribute('data-image-id') : null;
                if (imageId) onCropImage(imageId);
            },
        });
        editor.ui.registry.addContextMenu('imagecrop', {
            update: (element) => element.nodeName === 'IMG' ? ['imagecrop-item'] : [],
        });

        // Botão direito em cima de uma caixa (.box) → "Edição" (cor de fundo/contorno, sem CSS).
        // Grupo dinâmico (addContextMenu) em vez de listar o item direto no `contextmenu`: só
        // aparece quando o nó clicado está mesmo dentro de uma .box.
        editor.ui.registry.addMenuItem('boxedit-item', {
            text: 'Edição',
            icon: 'edit-block',
            onAction: () => openPanel('box'),
        });
        // Variante da caixa (classe box--X; o CSS vive no livro e o export dá-lhe epub:type).
        const blocks = tinymceEditorLike(editor);
        editor.ui.registry.addNestedMenuItem('boxvariant-item', {
            text: 'Tipo de caixa',
            icon: 'ps-box',
            getSubmenuItems: () => BOX_VARIANTS.map(([variant, text]) => ({
                type: 'togglemenuitem' as const,
                text,
                onSetup: (api: { setActive: (state: boolean) => void }) => { api.setActive(inspectBlock(blocks).box?.variant === variant); return () => {}; },
                onAction: () => applyBlockEdit(blocks, { target: 'box', patch: { variant } }),
            })),
        });
        // Painel lateral: acompanha o que está sob o cursor (só emite quando muda).
        const watcher = createBlockWatcher(blocks, (info) => live.current.onBlockChange?.(info));
        editor.on('NodeChange', watcher.update);
        let lastSelected = '';
        let selected: SelectedBlocks | null = null;
        // Destaca os blocos do âmbito da IA (marca efémera: não vai para o conteúdo gravado) e tira-a dos outros.
        const markAiScope = () => {
            const wanted = new Set<Element>();
            if (live.current.aiScope && selected) {
                const kids = editor.getBody().children;
                for (let i = 0; i < selected.texts.length; i++) if (kids[selected.index + i]) wanted.add(kids[selected.index + i]);
            }
            const marked = editor.dom.select(`[${MARK.aiScope}]`) as Element[];
            if (marked.length === wanted.size && marked.every((el) => wanted.has(el))) return;
            marked.forEach((el) => { if (!wanted.has(el)) editor.dom.setAttrib(el, MARK.aiScope, null); });
            wanted.forEach((el) => editor.dom.setAttrib(el, MARK.aiScope, '1'));
        };
        editor.on('aiscopechange', markAiScope); // despachado pelo WorkEditor quando a prop muda
        // Ao abrir o painel da IA, nenhum bloco fica ativo (anel, mini-menu) nem selecionado (âmbito): tira o cursor do editor.
        editor.on('aiopenchange', () => {
            if (!live.current.aiOpen) return;
            (editor.getDoc().activeElement as HTMLElement | null)?.blur();
            editor.selection.getSel()?.removeAllRanges();
            selected = null;
            lastSelected = JSON.stringify(null);
            live.current.onSelectedBlock?.(null);
            markAiScope();
            editor.nodeChanged(); // o bloco ativo (activeBlock.ts) reavalia-se sem cursor e limpa o anel
        });
        editor.on('NodeChange', () => { // o cursor continua nos blocos quando o foco passa para o painel da IA: só um NodeChange o muda
            if (!editor.hasFocus() && live.current.aiOpen) return; // sem foco com o painel aberto, a seleção (limpa ou herdada) não conta
            selected = selectedTopBlocks(editor.getBody(), editor.selection.getRng());
            markAiScope();
            const json = JSON.stringify(selected);
            if (json === lastSelected) return;
            lastSelected = json;
            live.current.onSelectedBlock?.(selected);
        });
        // Parágrafos/títulos/itens: abre o painel de edição do bloco.
        editor.ui.registry.addMenuItem('blockedit-item', {
            text: 'Editar bloco',
            icon: 'edit-block',
            onAction: () => openPanel('box'),
        });
        editor.ui.registry.addContextMenu('blockedit', {
            update: (element) => element.nodeName !== 'IMG' && editor.dom.getParent(element, TEXT_BLOCK_SELECTOR) && !editor.dom.getParent(element, '.box') ? ['blockedit-item'] : [], // numa imagem não aparece
        });
        editor.ui.registry.addContextMenu('boxedit', {
            update: (element) => editor.dom.getParent(element, '.box') ? ['boxedit-item', 'boxvariant-item'] : [],
        });

        registerEditorIcons(editor);

        // Botões inline do mini-menu de estilos (toggle por formato)
        ([
            ['psindent', 'p-indent', 'ps-indent', 'Com Indentação'],
            ['pstop', 'p-top', 'ps-top', 'Espaçamento no Topo'],
            ['psquote', 'p-quote', 'ps-quote', 'Citação'],
            ['psuppercase', 'p-uppercase', 'ps-uppercase', 'Maiúsculas'],
            ['psh1', 'h1', 'ps-h1', 'Título 1'],
            ['psh2', 'h2', 'ps-h2', 'Título 2'],
            ['psh3', 'h3', 'ps-h3', 'Título 3'],
        ] as const).forEach(([name, format, icon, tooltip]) => {
            editor.ui.registry.addToggleButton(name, {
                icon,
                tooltip,
                onAction: undoable(() => {
                    editor.formatter.toggle(format);
                    if (/^h[123]$/.test(format)) syncChapterMarker();
                }),
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

        const blockOf = (node: Node | null) =>
            node ? (editor.dom.getParent(node, 'p,h1,h2,h3,h4,h5,h6') as Element | null) : null;
        // Bloco ativo (anel, "+", pega; recolhido pelo 2.º clique) — activeBlock.ts.
        const activeBlock = attachActiveBlock(editor, { blockOf });

        // Placeholder: marca o <p> vazio focado (CSS mostra "Escreve algo…" via ::before).
        const refreshEmptyMarker = () => {
            editor.dom.select(`[${MARK.empty}]`).forEach((el: HTMLElement) => editor.dom.setAttrib(el, MARK.empty, null));
            if (!editor.hasFocus()) return;
            const block = blockOf(editor.selection.getNode()) as HTMLElement | null;
            if (block && block.nodeName === 'P' && !/\bchapter-break/.test(block.className)
                && !(block.textContent || '').replace(/\u00a0/g, '').trim() && !block.querySelector('img')) {
                editor.dom.setAttrib(block, MARK.empty, '1');
            }
        };
        editor.on('NodeChange', refreshEmptyMarker);
        editor.on('input', refreshEmptyMarker); // ao escrever/apagar, atualizar o placeholder

        // Converter parágrafo→título remove os estilos de parágrafo associados.
        // p-center (alinhamento) e p-space (espaçamento) mantêm-se — válidas num título.
        // ponytail: NodeChange é o choke point comum a todas as vias de conversão
        // (botões, menu "...", atalhos, markdown); estas classes nunca são legítimas num heading.
        editor.on('NodeChange', () => {
            if (!editor.hasFocus()) return;
            const block = blockOf(editor.selection.getNode());
            if (block && /^H[1-6]$/.test(block.nodeName)) {
                HEADING_STRIPPED_CLASSES.forEach((c) => block.classList.remove(c));
            }
        });

        // "Editor também": criar um h1/h2 insere o marcador de capítulo antes dele
        // (é o marcador, não o heading, que parte capítulos). Só em EVENTOS de conversão
        // (atalho/botão/menu) — nunca no NodeChange — para que apagar o marcador à mão
        // (h2 vira subtítulo dentro do capítulo) NÃO seja re-inserido ao clicar.
        function syncChapterMarker() {
            // Seleção de vários blocos: getNode() é o ancestral comum (sem bloco) — usar os blocos selecionados.
            const selected = (editor.selection.getSelectedBlocks() as HTMLElement[]).filter(b => /^(P|H[1-6])$/.test(b.nodeName) && !/\bchapter-break/.test(b.className));
            const first = blockOf(editor.selection.getNode()) as HTMLElement | null;
            const blocks = selected.length ? selected : first ? [first] : [];
            if (!blocks.length) return;
            // Dentro de caixa/grelha o marcador vai antes do contentor de topo: no meio do div partiria
            // o capítulo (HTML por fechar). O heading continua dentro da caixa.
            const anchors = blocks.map((block) => {
                let anchor: HTMLElement = block;
                for (let c = block.parentElement?.closest(CONTAINER_SELECTOR); c; c = c.parentElement?.closest(CONTAINER_SELECTOR)) anchor = c as HTMLElement;
                return anchor;
            });
            const prevMarker = (anchor: HTMLElement) => {
                const prev = anchor.previousElementSibling as HTMLElement | null;
                return prev && prev.nodeName === 'P' && isLevelMarkerClass(prev.className) ? prev : null;
            };
            const plan = planChapterMarkers(blocks.map((block, i) => ({
                heading: /^H[12]$/.test(block.nodeName) ? (block.nodeName.toLowerCase() as 'h1' | 'h2') : null,
                text: (block.textContent || '').replace(/\s+/g, ' ').trim(),
                markerBefore: !!prevMarker(anchors[i]),
                followsPrevious: i > 0 && blocks[i - 1].nextElementSibling === block,
            })));
            for (const action of plan) {
                const anchor = anchors[action.block];
                if (action.kind === 'create') {
                    const marker = editor.dom.create('p', { class: `chapter-break-${action.level}`, 'data-title': action.title });
                    anchor.parentNode!.insertBefore(marker, anchor);
                } else if (action.kind === 'setLevel') {
                    // Só sincroniza o nível (classe) — o título é só editável pelo botão
                    // de edição da Estrutura/TOC, nunca ao escrever no heading do editor.
                    editor.dom.setAttrib(prevMarker(anchor)!, 'class', `chapter-break-${action.level}`);
                } else {
                    editor.dom.remove(prevMarker(anchor)!); // heading despromovido → remover o seu marcador
                }
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
                api.hide();
                undoable(() => { // apagar o "/pattern" + aplicar = um só passo de undo
                    editor.selection.setRng(rng);
                    editor.execCommand('Delete'); // remove o "/pattern"
                    if (/^h[123]$/.test(value) || value === 'p') editor.execCommand('FormatBlock', false, value);
                    else if (value === 'image') editor.execCommand('mceImage');
                    else if (value === 'hr') editor.execCommand('mceInsertContent', false, '<hr>');
                    else if (value === 'anchor') editor.execCommand('mceInsertAnchor');
                    else editor.formatter.apply(value); // p-quote, p-small, footnote
                })();
                editor.focus();
            },
        });

        // Barra de estado: mostrar o CSS do bloco selecionado (seletor de classes
        // + style inline, e o código inline dos elementos em linha sob o cursor — cssInfo.ts) à esquerda do element-path. ponytail: injeta um elemento
        // próprio na .tox-statusbar e atualiza-o no NodeChange (o element-path do
        // tema é re-renderizado e não dá para customizar o label).
        let cssInfoEl: HTMLElement | null = null;
        const updateCssInfo = () => {
            if (!cssInfoEl) return;
            const node = editor.selection.getNode();
            const block = blockOf(node);
            const text = block && /^(P|H[1-6])$/.test(block.nodeName) ? blockCssInfo(block, node) : '';
            cssInfoEl.textContent = text;
            cssInfoEl.title = text || 'CSS do bloco selecionado'; // a barra corta com reticências: o texto inteiro vê-se ao passar o rato
        };
        editor.on('init', () => {
            const sb = editor.getContainer()?.querySelector('.tox-statusbar');
            if (sb) {
                cssInfoEl = document.createElement('div');
                cssInfoEl.title = 'CSS do bloco selecionado';
                cssInfoEl.style.cssText = 'flex:1;min-width:0;padding:0 8px;font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                sb.insertBefore(cssInfoEl, sb.firstChild);
                const labelEl = document.createElement('div');
                labelEl.dataset.psEbookLabel = '1';
                labelEl.textContent = live.current.ebookLabel;
                labelEl.title = live.current.ebookLabel;
                labelEl.style.cssText = 'flex:0 1 auto;max-width:40%;padding:0 8px;font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                sb.insertBefore(labelEl, sb.querySelector('.tox-statusbar__resize-handle'));
            }
            updateCssInfo();
        });
        editor.on('NodeChange', updateCssInfo);

        // Barra da seleção (negrito, itálico, cor…): o quickbars não deixa condicionar o predicado, por isso é
        // nossa (quickbars_selection_toolbar desligado em WorkEditor) — esconde-se com o painel "Editor de Texto" aberto.
        // Com estilos de caracteres criados (formatos `c-…`, ver formats.ts) a barra ganha o menu "Estilos"; sem eles não há botão.
        const charStyleNames = () => registeredCharStyles(editor);
        const selectionBar = (withStyles: boolean) => ({
            predicate: (node: Node) => !live.current.textPanelOpen && node.nodeName !== 'IMG' && !editor.selection.isCollapsed()
                && editor.dom.getContentEditableParent(node) !== 'false' && (charStyleNames().length > 0) === withStyles,
            items: withStyles ? `charstyles ${QUICKBARS_SELECTION_TOOLBAR}` : QUICKBARS_SELECTION_TOOLBAR,
            position: 'selection' as const,
            scope: 'editor' as const,
        });
        editor.ui.registry.addContextToolbar('textselection-ps', selectionBar(false));
        editor.ui.registry.addContextToolbar('textselection-ps-styles', selectionBar(true));
        editor.ui.registry.addMenuButton('charstyles', {
            icon: 'format',
            tooltip: 'Estilos de caracteres',
            fetch: (callback) => callback(charStyleNames().map((format) => ({
                type: 'togglemenuitem' as const, text: charStyles.label(format), onAction: undoable(() => toggleCharStyle(editor, format)),
                onSetup: (api: { setActive(state: boolean): void }) => {
                    api.setActive(editor.formatter.match(format));
                    editor.formatter.formatChanged(format, (active) => api.setActive(active));
                    return () => {};
                },
            }))),
        });
        // Botão "Editor de Texto" na barra da seleção → abre o painel lateral (formato, cor, fundo, tamanho, estilos de caracteres).
        editor.ui.registry.addButton('edittext', {
            icon: 'edit-block',
            tooltip: 'Editor de Texto',
            onAction: () => openPanel('text'),
        });
        // Botão "Editar bloco" no mini-menu do título → abre o painel do bloco.
        editor.ui.registry.addButton('editblock', {
            icon: 'edit-block',
            tooltip: 'Editar bloco',
            onAction: () => openPanel('box'),
        });
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
        // "Ligar a…" no mini-menu do Índice: abre o painel React (overlays/IndiceLinkPanel.tsx) com
        // capítulos e subtítulos — cobre as entradas que o automático (Criação Links Índice, ver
        // indice-links.ts) não apanha, ex. título da entrada e do capítulo não batem por texto. Só
        // ativo dentro do capítulo classificado como Índice; chapters/activeChapterIndex vêm por
        // ref porque este setup() só corre uma vez, no mount.
        editor.ui.registry.addButton('idxlinktarget', {
            icon: 'link',
            tooltip: 'Ligar a…',
            onAction: () => {
                // Já ligada? o data-target do idx-link no parágrafo é o destino atual — o painel marca-o com visto.
                const block = blockOf(editor.selection.getNode()) as HTMLElement | null;
                if (!block || block.nodeName !== 'P') return;
                const pIndex = entryIndexOf(editor.getBody(), block);
                if (pIndex === -1) return;
                const curTarget = block.querySelector('span.idx-link')?.getAttribute('data-target') || '';
                openIndiceLinkPanel(pIndex, curTarget);
            },
            onSetup: (api) => {
                const update = () => api.setEnabled(isIndiceChapterTitle(live.current.chapters[live.current.activeChapterIndex]?.title || ''));
                update();
                editor.on('NodeChange', update);
                return () => editor.off('NodeChange', update);
            },
        });

        // Âncora manual: clicar no ⚓ (pseudo-elemento do span) seleciona-a e mostra "Remover âncora".
        // Ligações do Índice que lhe apontem ficam só como texto no export (ver convertIndexLinks).
        const isManualAnchor = (n: Node | null) => !!n && n.nodeName === 'SPAN' && (n as HTMLElement).classList.contains(MANUAL_ANCHOR_CLASS);
        editor.on('click', (e: MouseEvent) => { if (isManualAnchor(e.target as Node)) editor.selection.select(e.target as Node); });
        editor.ui.registry.addButton('removeanchor', {
            icon: 'remove',
            text: 'Remover âncora',
            onAction: () => {
                const node = editor.selection.getNode();
                if (isManualAnchor(node)) editBlocks(editor, () => editor.dom.remove(node));
            },
        });
        editor.ui.registry.addContextToolbar('manualanchor', {
            predicate: isManualAnchor,
            position: 'node',
            scope: 'node',
            items: 'removeanchor',
        });

        // Botão (ícone ¶) de estilo de parágrafo — redundante de propósito com os botões psX (acesso
        // rápido sem procurar o botão certo). Ícone em vez do texto do estilo ativo: mini-menu mais
        // estreito; o estilo ativo vê-se pelo visto no menu (match lido só ao abrir).
        editor.ui.registry.addMenuButton('pscombopara', {
            icon: 'paragraph',
            tooltip: 'Estilo do parágrafo',
            fetch: (callback) => {
                // 'p' casa com QUALQUER <p> → "Padrão" só marcado quando nenhum outro estilo está.
                const active = new Set(PARAGRAPH_QUICK_STYLES.map(([f]) => f).filter((f) => f !== 'p' && editor.formatter.match(f)));
                if (!active.size) active.add('p');
                callback(PARAGRAPH_QUICK_STYLES.map(([format, label]) => ({
                    type: 'togglemenuitem',
                    text: label,
                    active: active.has(format),
                    onAction: undoable(() => toggleCharStyle(editor, format)),
                })));
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
        // Dentro de uma caixa (.box) o mini-menu ganha "Editar caixa" (abre o painel na secção da caixa).
        editor.ui.registry.addButton('editbox', {
            icon: 'ps-box',
            tooltip: 'Editar caixa',
            onAction: () => openPanel('box'),
        });
        const PARA_ITEMS = 'psmorepara pscombopara blockalignmenu psindent pstop psquote psuppercase idxlinktarget edithtml';
        const paraToolbar = (inBox: boolean) => ({
            // Só com o cursor colapsado — em seleção de texto mostra-se o bubble, não o mini-menu.
            // Também em <li> (blockOf não inclui 'li' — usado pelo sistema de pega/+ que não se
            // estende a listas; aqui só precisamos do mini-menu de estilos, por isso getParent
            // próprio em vez de alargar blockOf), para dar acesso a p-top/p-quote/etc. em bullets.
            predicate: (node: Node) => {
                const block = blockOf(node) || editor.dom.getParent(node, 'li');
                return !!block && (block.nodeName === 'P' || block.nodeName === 'LI') && !activeBlock.isCollapsed(block) && editor.selection.isCollapsed()
                    && !!editor.dom.getParent(node, '.box') === inBox;
            },
            position: 'node' as const,
            scope: 'node' as const,
            items: inBox ? `${PARA_ITEMS} editbox` : PARA_ITEMS,
        });
        editor.ui.registry.addContextToolbar('parastyles', paraToolbar(false));
        editor.ui.registry.addContextToolbar('boxparastyles', paraToolbar(true));
        // Em título: "Mais estilos" (⋮) no canto esquerdo, alinhamento logo à direita, depois estilos inline.
        editor.ui.registry.addContextToolbar('headingstyles', {
            predicate: (node: Node) => {
                const block = blockOf(node);
                return !!block && /^H[1-6]$/.test(block.nodeName) && !activeBlock.isCollapsed(block) && editor.selection.isCollapsed();
            },
            position: 'node',
            scope: 'node',
            items: 'psmorehead blockalignmenu psh1 psh2 psh3 editblock edithtml',
        });

        // Versaletes: sobre uma seleção reescreve o texto em Maiúscula+minúsculas dentro do span (as versaletes
        // do TinyMCE só mudam o tamanho das maiúsculas existentes).
        const toggleSmallCaps = undoable(() => {
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
        });
        // Versaletes, texto pequeno e maiúsculas num só botão da barra da seleção (itens com visto = ativo).
        const caseItems: [string, string, () => void][] = [
            ['small-caps', 'Versaletes', toggleSmallCaps],
            ['small-text', 'Texto pequeno', undoable(() => editor.formatter.toggle('small-text'))],
            ['uppercase', 'Maiúsculas', undoable(() => editor.formatter.toggle('uppercase'))],
        ];
        editor.ui.registry.addMenuButton('casemenu', {
            icon: 'ps-smallcaps',
            tooltip: 'Versaletes, texto pequeno, maiúsculas',
            fetch: (callback) => callback(caseItems.map(([format, text, onAction]) => ({
                type: 'togglemenuitem' as const, text, onAction,
                onSetup: (api: { setActive(state: boolean): void }) => {
                    api.setActive(editor.formatter.match(format));
                    editor.formatter.formatChanged(format, (active) => api.setActive(active));
                    return () => {};
                },
            }))),
        });

        editor.ui.registry.addButton('aiassistant', {
            text: 'IA', tooltip: 'Assistente de IA',
            onAction: () => live.current.onToggleAi?.(),
        });
        editor.ui.registry.addToggleButton('pdfview', {
            icon: 'document-properties', tooltip: 'Ver PDF',
            onAction: () => live.current.onTogglePrintPdf?.(),
            onSetup: (api) => {
                const update = () => api.setActive(!!live.current.showPrintPdfPanel);
                update();
                editor.on('pdfpanelchange', update); // despachado pelo WorkEditor quando a prop muda
                return () => editor.off('pdfpanelchange', update);
            },
        });
        editor.ui.registry.addButton('focusmode', {
            icon: 'fullscreen', tooltip: 'Modo Foco',
            onAction: () => live.current.onToggleFocusMode?.(),
        });

        editor.ui.registry.addToggleButton('box', {
            icon: 'ps-box',
            tooltip: 'Envolver em caixa com borda',
            onAction: undoable(() => {
                const selectedNode = editor.selection.getNode();
                const existingBox = editor.dom.getParent(selectedNode, '.box') as HTMLElement | null;
                if (existingBox) {
                    editor.dom.setOuterHTML(existingBox, existingBox.innerHTML);
                } else {
                    const html = editor.selection.getContent({ format: 'html' });
                    if (html.trim()) {
                        // A caixa envolve os BLOCOS da seleção (nunca vai para dentro de um p/h2: seria HTML inválido e o título perdia-se ao recarregar).
                        const body = editor.getBody();
                        const tops = [...new Set(editor.selection.getSelectedBlocks()
                            .map((b) => editor.dom.getParent(b, (n: Node) => n.parentNode === body) as HTMLElement | null)
                            .filter((b): b is HTMLElement => !!b && !/chapter-break/.test(b.className)))];
                        if (tops.length === 0) return editor.selection.setContent(`<div class="box">${html}</div>`);
                        const box = editor.dom.create('div', { class: 'box' });
                        tops[0].before(box);
                        box.append(...tops);
                    }
                }
            }),
            onSetup: (api) => {
                const handler = () => {
                    const node = editor.selection.getNode();
                    api.setActive(!!editor.dom.getParent(node, '.box'));
                };
                editor.on('NodeChange', handler);
                return () => editor.off('NodeChange', handler);
            },
        });

        // Barra de formatação fixa (padrão) vs. oculta (aparece com o rato): classe no <html> → index.css.
        // A barra vive no documento principal, por isso a classe é do `document`, não do iframe.
        const PIN_KEY = 'wp-toolbar-pinned';
        const readPinned = () => { try { return localStorage.getItem(PIN_KEY) !== '0'; } catch { return true; } };
        document.documentElement.classList.toggle('toolbar-pinned', readPinned());
        editor.ui.registry.addToggleButton('pintoolbar', {
            icon: 'ps-pin',
            tooltip: 'Fixar a barra de formatação',
            onAction: (api) => {
                const pinned = !api.isActive();
                document.documentElement.classList.toggle('toolbar-pinned', pinned);
                try { localStorage.setItem(PIN_KEY, pinned ? '1' : '0'); } catch { /* sem storage */ }
                api.setActive(pinned);
            },
            onSetup: (api) => { api.setActive(readPinned()); return () => {}; },
        });

        editor.ui.registry.addToggleButton('noBreak', {
            icon: 'ps-union',
            tooltip: 'União entre título e o parágrafo',
            onAction: undoable(() => {
                // Wrap manual (igual ao botão "box") em vez de editor.formatter.apply: o
                // formatter nativo do TinyMCE, ao abranger seleção com vários <p>, funde-os
                // num só bloco em vez de os envolver preservando cada um.
                const selectedNode = editor.selection.getNode();
                const existingWrap = editor.dom.getParent(selectedNode, '.noBreak') as HTMLElement | null;
                if (existingWrap) {
                    editor.dom.setOuterHTML(existingWrap, existingWrap.innerHTML);
                } else {
                    const html = editor.selection.getContent({ format: 'html' });
                    if (html.trim()) {
                        editor.selection.setContent(`<div class="noBreak">${html}</div>`);
                    }
                }
            }),
            onSetup: (api) => {
                const handler = () => {
                    const node = editor.selection.getNode();
                    api.setActive(!!editor.dom.getParent(node, '.noBreak'));
                };
                editor.on('NodeChange', handler);
                return () => editor.off('NodeChange', handler);
            },
        });

        // Comentário: envolve a seleção num span.comment-anchor (mesmo padrão de wrap
        // manual do "box"/"noBreak" — editor.formatter.apply não serve para inline com uuid
        // dinâmico). O span é removido do HTML antes do export (ver html-cleaner.ts).
        editor.ui.registry.addButton('addcomment', {
            icon: 'comment',
            tooltip: 'Comentar',
            onAction: () => {
                const html = editor.selection.getContent({ format: 'html' });
                if (!html.trim()) return;
                const anchorId = crypto.randomUUID();
                editor.selection.setContent(`<span class="comment-anchor" data-comment-id="${anchorId}">${html}</span>`);
                editor.dispatch('Change');
                onAddComment?.(anchorId);
            },
        });

        // Overlays estilo Notion (fora do iframe): instalar reação ao editor.
        wireOverlays(editor, { blockOf, activeBlock });
    };
}
