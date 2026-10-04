// Só para bun (CLI do skill e testes): regista DOMParser/XMLSerializer do happy-dom como globais, que o
// browser já tem. Importar ANTES dos módulos da importação InDesign. A app (browser) nunca importa isto.
import { Window } from 'happy-dom';

const win = new Window();
Object.assign(globalThis, { DOMParser: win.DOMParser, XMLSerializer: win.XMLSerializer });
