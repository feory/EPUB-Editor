import type { Editor } from 'tinymce';
import { editBlocks } from './blockEdit';

// Ferramentas de imagem do editor: botões de alinhamento, deslocamento vertical (diálogo + pega de arrasto
// dentro do iframe) e a barra de contexto que os agrupa.
export function registerImageTools(editor: Editor) {
    const setImgAlign = (cls: string) => {
        const node = editor.selection.getNode();
        if (node.nodeName !== 'IMG') return;
        editBlocks(editor, () => {
            ['img-left', 'img-center', 'img-right', 'img-inline'].forEach((c) => editor.dom.removeClass(node, c));
            editor.dom.addClass(node, cls);
        });
    };
    ([
        ['imgalignleft', 'img-left', 'align-left', 'Imagem à esquerda'],
        ['imgaligncenter', 'img-center', 'align-center', 'Imagem centrada'],
        ['imgalignright', 'img-right', 'align-right', 'Imagem à direita'],
        ['imgaligninline', 'img-inline', 'ps-imginline', 'Imagem na linha'],
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
    // Ajuste fino de posição vertical (ex. imagem em linha que não fica bem alinhada ao
    // texto por omissão) — translateY em px, aplicado por cima do resto do style inline
    // (transform é só mais uma propriedade; largura/altura do resize do TinyMCE mantêm-se).
    const getTranslateY = (el: HTMLElement) => parseFloat(/translateY\((-?[\d.]+)px\)/.exec(el.style.transform)?.[1] || '0');
    editor.ui.registry.addButton('imgvoffset', {
        icon: 'ps-imgvoffset',
        tooltip: 'Ajustar posição vertical',
        onAction: () => {
            const node = editor.selection.getNode();
            if (node.nodeName !== 'IMG') return;
            const current = String(getTranslateY(node as HTMLElement));
            editor.windowManager.open({
                title: 'Ajustar posição vertical',
                body: {
                    type: 'panel',
                    items: [{ type: 'input', name: 'offset', label: 'Deslocação vertical (px, negativo = para cima)' }],
                },
                initialData: { offset: current },
                buttons: [
                    { type: 'cancel', text: 'Cancelar' },
                    { type: 'submit', text: 'Aplicar', primary: true },
                ],
                onSubmit: (api: { getData: () => { offset: string }; close: () => void }) => {
                    const value = parseFloat(api.getData().offset);
                    api.close();
                    editBlocks(editor, () => {
                        (node as HTMLElement).style.transform = value ? `translateY(${value}px)` : '';
                    });
                },
            });
        },
    });
    editor.ui.registry.addContextToolbar('imagealign', {
        predicate: (node: Element) => node.nodeName === 'IMG',
        position: 'node',
        scope: 'node',
        items: 'imgalignleft imgaligncenter imgalignright imgaligninline imgvoffset',
    });

    // Pega de arrasto para a posição vertical (translateY) de uma imagem selecionada.
    // Vive DENTRO do próprio iframe (mesmo sistema de coordenadas da imagem) — ao contrário
    // do botão "+"/pega de bloco (overlay React fora do iframe), aqui não há scroll da
    // página exterior a compensar, por isso não precisa desse mecanismo mais pesado.
    editor.on('init', () => {
        const doc = editor.getDoc();
        if (!doc) return;
        const grip = doc.createElement('div');
        grip.setAttribute('data-mce-bogus', 'all'); // nunca serializa/exporta
        // position:fixed (não absolute): getBoundingClientRect() é relativo ao VIEWPORT, e o
        // body do iframe não tem position:relative (de propósito, ver span.pagebreak acima) —
        // absolute sem ancestral posicionado ficava relativo ao topo do documento inteiro,
        // invisível assim que havia scroll no capítulo.
        grip.style.cssText = 'position:fixed;width:22px;height:14px;background:#475569;'
            + 'border-radius:4px;cursor:ns-resize;display:none;z-index:1000;box-shadow:0 1px 3px rgba(0,0,0,.3);';
        grip.innerHTML = '<svg width="22" height="14" viewBox="0 0 22 14"><path fill="none" stroke="#fff" '
            + 'stroke-width="1.5" stroke-linecap="round" d="M6 4l5-3 5 3M6 10l5 3 5-3"/></svg>';
        doc.body.appendChild(grip);

        let dragging = false;
        let dragImg: HTMLImageElement | null = null;
        let startY = 0;
        let startOffset = 0;

        const positionGrip = (img: HTMLImageElement) => {
            // Fora da caixa da imagem (por baixo, centrado) — nos cantos ficava tapado
            // pelas pegas nativas de resize do TinyMCE.
            const r = img.getBoundingClientRect();
            grip.style.left = `${r.left + r.width / 2 - 11}px`;
            grip.style.top = `${r.bottom + 4}px`;
            grip.style.display = 'block';
        };
        const hideGrip = () => { grip.style.display = 'none'; };
        let selectedImg: HTMLImageElement | null = null;

        editor.on('NodeChange', () => {
            if (dragging) return;
            const node = editor.selection.getNode();
            if (node.nodeName === 'IMG' && editor.hasFocus()) {
                selectedImg = node as HTMLImageElement;
                positionGrip(selectedImg);
            } else {
                selectedImg = null;
                hideGrip();
            }
        });
        // Scroll não dispara NodeChange — sem isto o grip ficava parado no sítio antigo
        // (fixed) enquanto o conteúdo (e a imagem) deslizava por baixo.
        editor.getWin().addEventListener('scroll', () => {
            if (selectedImg && !dragging) positionGrip(selectedImg);
        }, { passive: true });

        grip.addEventListener('mousedown', (e: MouseEvent) => {
            const node = editor.selection.getNode();
            if (node.nodeName !== 'IMG') return;
            e.preventDefault();
            dragging = true;
            dragImg = node as HTMLImageElement;
            startY = e.clientY;
            startOffset = getTranslateY(dragImg);
            doc.body.style.userSelect = 'none';
        });
        const endDrag = () => {
            if (!dragging) return;
            dragging = false;
            doc.body.style.userSelect = '';
            // O deslocamento já foi escrito durante o arrasto: aqui só se regista o resultado
            // como UM passo de undo (o arrasto inteiro), não um por cada mousemove.
            editBlocks(editor, () => {});
            dragImg = null;
        };
        doc.addEventListener('mousemove', (e: MouseEvent) => {
            if (!dragging || !dragImg) return;
            const delta = e.clientY - startY;
            dragImg.style.transform = `translateY(${startOffset + delta}px)`;
            positionGrip(dragImg);
        });
        doc.addEventListener('mouseup', endDrag);
        // ponytail: largar o botão FORA do iframe (a mais provável ao arrastar rápido) não
        // dispara mouseup dentro do doc do iframe — apanhado pela janela exterior; suficiente
        // para o uso normal (ajuste vertical pequeno), sem replicar o sistema de captura de
        // ponteiro do drag de blocos.
        window.addEventListener('mouseup', endDrag);
        editor.on('remove', () => {
            window.removeEventListener('mouseup', endDrag);
            grip.remove();
        });
    });
}
