## 1. O que é a aplicação

É uma ferramenta para **preparar livros digitais (ebooks)** no formato EPUB, o formato lido em e-readers e aplicações de leitura. Em vez de começares do zero, podes **importar** um livro que já exista (Word, PDF, InDesign ou outro EPUB), **corrigi-lo e arrumá-lo** no editor, **verificar** se está tecnicamente correto e **exportar** o ficheiro final.

---

## 2. Página inicial: a tua estante de livros

Quando entras, vês os teus livros em dois separadores:

- **Em Progresso** — os livros em que estás a trabalhar.
- **Concluído** — os livros terminados. Os livros concluídos **não abrem no editor**, para ninguém os estragar por engano.

Podes ver os livros em **grelha** (capas) ou em **tabela**; a escolha fica guardada. Há pesquisa e um filtro **Todos / Meus / Partilhados comigo**.

Em cada livro tens um menu com:

| Ação | O que faz |
|---|---|
| **Edição da Informação** | Muda título, autor, editora, idioma e outros dados |
| **Capa** | Carregar uma capa (**Upload**), gerar uma automática (**Gerar Auto**) ou **Remover** |
| **Partilha** | Dar acesso a outros utilizadores (ver secção 14) |
| Marcar como concluído / em progresso | Muda o separador onde o livro aparece |
| Descarregar | Obter o EPUB |
| Apagar | Envia o livro para a **Reciclagem** |

**Reciclagem** (ícone do caixote, em baixo à direita): os livros apagados não desaparecem logo. Podes **Restaurar**, **Eliminar permanentemente** um livro, ou **Eliminar tudo**. A eliminação definitiva pede confirmação e não se desfaz.

No canto superior direito:

- **Sino** — avisos (por exemplo, quando alguém partilha um livro contigo ou responde a um comentário teu).
- **Avatar** — menu com **A minha conta** (mudar nome e password), opções de visualização, **Documentação** (esta página) e **Terminar Sessão**. Os administradores têm ainda **Painel**, **Importação EPUB 2.0** e **Importação InDesign**.

---

## 3. Criar ou importar um livro

### Livro novo, em branco

**Novo Ebook** → preenche o E-ISBN, título e autor (obrigatórios) e, se quiseres, ISBN do livro físico, sinopse, editora, data de publicação e idioma (português, inglês, espanhol ou francês).

### Importar um livro que já existe

**Novo Ebook** cria um livro em branco. Para trazer o conteúdo de um ficheiro, abre o livro e usa **Ferramentas → Importação** (ou arrasta o ficheiro para o texto). Os administradores podem ainda criar um livro diretamente a partir de um EPUB, no menu do avatar.

| Origem | O que acontece |
|---|---|
| **Word (.docx)** | O texto é convertido. Podes **escolher o que cada estilo do Word vira** (parágrafo normal, título, citação, nota…) antes de importar. Os travessões de diálogo e as chamadas de nota são reconhecidos. |
| **PDF** | O texto é extraído; parágrafos partidos pelas quebras de página são juntados; podes guardar o PDF para consulta (separador «PDF de Impressão» no editor). |
| **InDesign (.idml)** | Reconhece figuras e legendas, notas de rodapé, capitulares e colunas. |
| **EPUB de InDesign** | A **Importação InDesign** (menu do avatar, só administradores) analisa o ficheiro, faz perguntas quando há dúvidas (por exemplo, quais os títulos que são mesmo capítulos) e optimiza o ficheiro para os estilos do editor. Se faltar texto, imagens ou notas, **avisa e bloqueia** em vez de importar um livro incompleto. |
| **EPUB antigo** | (**Importação EPUB 2.0**, só administradores) Mostra as classes de formatação antigas e propõe a que estilo do editor correspondem; podes ajustar uma a uma. |

Ao importar para o livro aberto, há opções como:

- sem avanço na primeira linha do parágrafo a seguir a um título;
- espaço extra acima dos parágrafos em negrito;
- espaço no parágrafo seguinte;
- união de parágrafos partidos;
- converter listas em diálogo (travessão).

Em **Ferramentas → Auxílio → Conversões** aplicas estas mesmas arrumações ao texto que já lá está.

As imagens do livro importado são enviadas e guardadas automaticamente; imagens EPS e PDF são convertidas.

---

## 4. O editor: visão geral

Ao abrir um livro tens, de cima para baixo e da esquerda para a direita:

- **Barra de topo**: **Guardar**, **Galeria**, **Ferramentas**, **Validações** e **Exportar**.
- **Estrutura** (à esquerda): a lista dos capítulos. Pode ser escondida.
- **O texto** (ao centro), com uma barra de formatação por cima.
- **Painéis laterais** (à direita), que abrem consoante o que estás a fazer: bloco, texto, comentários, galeria, validação, IA…

Outras coisas úteis:

- **Continuar onde ficaste**: ao reabrir um livro, perguntamos se queres voltar ao último capítulo e parágrafo, ou começar do início.
- **Gravação automática** a cada 5 minutos, mais o botão **Guardar** (ou Ctrl+S). Se o navegador fechar a meio, há um **rascunho** local que podes recuperar, ver as diferenças ou descartar.
- **Modo Foco**: esconde tudo menos o texto (Ctrl+Shift+F; **Sair** ou Esc para voltar).
- **Modo leitura**: se outra pessoa estiver a editar o mesmo livro, o teu fica só para ler, para ninguém apagar o trabalho do outro.
- **Barra de formatação fixa ou flutuante** (botão do alfinete).
- **Barra de estado** em baixo, com o ISBN e informação do que está sob o cursor.

---

## 5. Escrever e formatar

### Formatação normal

Negrito, itálico, sublinhado, desfazer/refazer, alinhamento (esquerda, centro, direita), listas com marcadores ou números, aumentar/diminuir recuo, ligações, imagens, símbolos especiais, e ver/editar o código HTML.

### Estilos de parágrafo (menu «Formats»)

- **Títulos**: Título 1, 2 e 3.
- **Parágrafos**: Padrão, Com Indentação, Topo, Espaço Extra, Texto Pequeno, Citação, Negrito, Itálico, Negrito + Itálico, Maiúsculas, Legenda, Separador (*).
- **Bordas**: superior, inferior ou lateral.
- **Especial**: Capitular (primeira letra grande), Nota de Rodapé, Box (caixa com contorno).

### Ajudas ao escrever

- **Mini-menu** que aparece junto ao parágrafo onde estás, com as ações mais usadas; o botão **«⋮»** abre mais opções.
- **Botão «+»** na borda inferior do parágrafo: insere um novo bloco (parágrafo, título, imagem, divisória…) logo a seguir.
- **Pega de mover** na esquerda do bloco: **sobe** ou **desce** o parágrafo, arrasta-o, ou abre um menu com **Duplicar** e **Eliminar**.
- **Menu «/»** (estilo Notion): escreve `/` numa linha vazia e escolhe o que inserir.
- **Divisória** (linha horizontal): escreve `---` ou usa o menu; pode ser pequena ou larga.
- **Editar HTML do bloco**: para quem sabe, abre o código só desse parágrafo.
- **Selecionar texto** abre uma barra de formatação rápida junto à seleção.
- **Tabelas e grelhas**: formatação do contorno, cantos e fundo, aplicável a todas as células de uma vez.

### Painéis de edição fina

- **Edição do Bloco** (botão direito no parágrafo → **Editar bloco**): alinhamento, recuo, margens, tamanho, entrelinha, cor, fundo, contornos e caixa do parágrafo selecionado, com **Repor** para voltar ao original.
- **Estilos de Caracteres** (seleciona o texto e carrega em **Editor de Texto** na barra junto à seleção): negrito, itálico, sublinhado, riscado, sobrescrito, subscrito, cor, fundo, tamanho, tipo de letra, maiúsculas, espaço entre letras e caixa.
- **Imagem**: texto alternativo, tamanho e posição. Com o painel Edição do Bloco aberto, clica na imagem para ver estas opções.

---

## 6. Estrutura: capítulos

A lista da esquerda mostra todos os capítulos. Por cima de cada capítulo está uma **linha tracejada** com o título: é a fronteira onde um capítulo acaba e outro começa (é invisível no ebook final).

Em cada capítulo podes:

- **Clicar** para saltar até ele;
- **Editar título**;
- **Arrastar para reordenar** (move também os subcapítulos);
- **Duplicar** ou **Eliminar** (pede confirmação);
- **Esconder do Índice** (o capítulo continua no livro mas não aparece no Índice) ou **Mostrar** outra vez;
- Mudar o nível: capítulo principal, subcapítulo ou parte sem título.

O Documento Completo permite ver o livro todo seguido.

---

## 7. Estilos próprios

Além dos estilos que já vêm com a aplicação, podes criar os teus, para usares sempre o mesmo aspeto:

- **De parágrafo** (alinhamento, recuo, margens, tamanho, cor…);
- **De caracteres** (para palavras ou frases, com separadores Formato, Aspeto, Sublinhado e Caixa);
- **De caixa** (contorno, cantos, espaço interior e fundo).

Cada estilo pode ser **criado, clonado, editado, renomeado e apagado** (menu «⋯»). Aparecem no menu de formatos e **vão para o EPUB**. Alterar um estilo muda todos os sítios onde ele é usado.

Em **Ferramentas → Estilos** há ainda:

- **Fontes**: escolher o tipo de letra e o tamanho do editor;
- **Editor CSS**: para quem sabe, editar diretamente a folha de estilos do livro.

---

## 8. Imagens e galeria

A **Galeria** (botão na barra de topo) mostra todas as imagens do livro.

- **Carregar** imagens (também arrastando-as para o painel).
- **Pesquisar** e **filtrar**: todas, usadas, não usadas.
- Por imagem: **Inserir no cursor**, **Localizar no editor**, **Cortar**, **Substituir**, **Renomear**, **Apagar**.
- **Seleção em lote**: selecionar todas, descarregar ou apagar várias de uma vez.
- Ampliação (lightbox) para ver a imagem em grande.

**Texto alternativo**: a descrição da imagem para quem usa leitor de ecrã. Podes escrevê-lo no painel da imagem ou pedir ao assistente de IA (ver secção 13).

---

## 9. Notas de rodapé, Índice e lista de páginas

### Notas de rodapé
Marca-se o texto da nota com o estilo «Nota de Rodapé». No EPUB exportado ficam como notas clicáveis, com ligação de ida e de volta.

### Índice (sumário)
- **Criação Links Índice**: liga automaticamente cada linha do Índice ao capítulo com o mesmo título.
- **Ligar a…**: para as entradas que o automático não apanha, escolhes tu o capítulo ou subtítulo (com pesquisa), no mini-menu do editor.
- **Âncoras**: podes marcar um ponto qualquer do texto como destino de uma ligação.
- **Remover ligação** ou **Remover âncora** quando já não fizerem falta.
- **Editor de TOC** (Ferramentas): ajustar o Índice de navegação do EPUB.

### Índice remissivo
- **Limpeza de Índice Remissivo**: remove os números de páginas do índice remissivo importado.
- **Ligação Páginas do Índice Remissivo**: liga as entradas às páginas.

### Lista de páginas (page-list)
Para os leitores poderem saltar «para a página 57» como no livro em papel. A aplicação:
- deteta os números de página no PDF importado e **marca os fins de página** no texto;
- permite **Ferramentas → Auxílio → Atualização Pagelist** quando o livro muda;
- exporta a lista no EPUB.

---

## 10. Comentários, histórico e comparação

- **Comentários**: seleciona um trecho de texto e comenta; os colegas respondem. Cada comentário fica ligado ao texto a que se refere.
- **Histórico**: guarda versões do livro. Podes **ver**, **marcar** uma versão com nome (e as marcadas nunca são apagadas pela limpeza automática) e **voltar atrás**. Também lista os **EPUBs** exportados.
- **Comparação**: compara o livro atual com um **ficheiro** que carregues ou com uma **versão do histórico**. Mostra o que foi acrescentado, removido ou modificado, e assinala quando só a formatação mudou. Clicar numa diferença leva ao parágrafo.
- **PDF de Impressão**: se importaste a partir de um PDF, podes consultá-lo ao lado do texto e saltar para a página correspondente.
- **Estatísticas**: palavras, caracteres, capítulos e outros números do livro.

---

## 11. Verificações (validações)

Menu **Validações**. Todas apontam o problema e levam-te ao sítio no editor (**Ir ao editor**).

| Verificação | Para que serve |
|---|---|
| **Revisão Gramatical** | Corrige erros de escrita (LanguageTool). Podes aceitar, rejeitar ou marcar todas as ocorrências iguais. É opcional e depende de estar configurado. |
| **Validação de Notas** | Confere se todas as notas têm chamada no texto e vice-versa. |
| **Validação de Links** | Procura ligações partidas. |
| **Validação Ebook** | O EPUBCheck: confere se o ficheiro cumpre as regras do formato. |
| **Validação Ace** | Acessibilidade: se o livro é utilizável por quem usa leitor de ecrã (cores com contraste, ordem dos títulos, imagens sem descrição…). |

O assistente de IA também corre estas verificações por ti e explica os resultados.

---

## 12. Exportar e pré-visualizar

Menu **Exportar**:

- **Pré-visualizar**: vê o livro como num leitor de EPUB, antes de exportar.
- **Descarregar EPUB** (Ctrl+E): gera o ficheiro EPUB3 final.

O EPUB exportado inclui: capítulos separados, Índice de navegação, notas de rodapé clicáveis, lista de páginas (quando existe), capa, metadados (título, autor, editora, idioma) e cores ajustadas para serem legíveis. Os marcadores internos do editor (linhas tracejadas, âncoras visíveis…) **não** aparecem no ficheiro final.

Os dados do livro (título, autor, editora, idioma…) editam-se em **Edição da Informação**, na página inicial.

---

## 13. Assistente de IA

Botão **IA** na barra de formatação. Tu pedes em português normal («põe as aspas à portuguesa», «o livro está pronto?»), ele propõe e **só muda alguma coisa depois de carregares em Aplicar**. Tudo fica registado e pode ser revertido.

Resumo do que faz: alterar formatação em massa, criar e alterar estilos, apagar estilos sem uso, trocar texto no livro todo, arrumar a tipografia, mexer em títulos de capítulos e no Índice, auditar a formatação, correr as validações, dizer se o livro está pronto para exportar e gerar o texto alternativo das imagens.

Todos os detalhes, com exemplos, no [guia do assistente de IA](doc:assistente).

---

## 14. Trabalho em equipa e partilha

- **Partilha**: o dono do livro pode dar acesso a outros utilizadores. Quem recebe só remove a sua própria partilha; não apaga o livro para os outros. Os livros aparecem com «Partilhado por …».
- **Presença**: vês quando outra pessoa está a editar o livro; nesse caso o teu fica em modo leitura.
- **Avisos** (sino): partilhas, respostas a comentários teus e comentários em livros teus.
- **A minha conta**: mudas o teu nome e apelido e a tua password (pede a atual e termina as outras sessões abertas).

---

## 15. Painel de administração {admin}

Esta secção só aparece aos administradores (menu do avatar → **Painel**):

| Separador | O que mostra |
|---|---|
| **Estatísticas** | Números por livro e, se a IA estiver ativa, o **consumo de IA** (por dia, utilizador, tipo e modelo) |
| **Livros** | Todos os livros, com pesquisa |
| **Utilizadores** | Criar, editar, definir função (admin ou utilizador), repor password, apagar |
| **Sistema** | Espaço em disco, sessões ativas, saúde do sistema |
| **Backup** | Cópias de segurança para a nuvem (Backblaze B2), quando configurado |
| **IA** | Escolher o fornecedor e o modelo, guardar a chave (fica cifrada) e testar |
| **Logs** | Registo de atividade |

---

## 16. Atalhos de teclado

(Em Mac, usa ⌘ em vez de Ctrl.)

| Atalho | O que faz |
|---|---|
| Ctrl + B / I / U | Negrito / Itálico / Sublinhado |
| Ctrl + Z / Y | Desfazer / Refazer |
| Ctrl + S | Guardar |
| Ctrl + E | Exportar EPUB |
| Ctrl + Shift + F | Modo Foco |
| Ctrl + P | Parágrafo padrão |
| Ctrl + I | Parágrafo com indentação |
| Ctrl + T | Parágrafo de topo (espaço extra) |
| Ctrl + 1 / 2 / 3 | Título 1 / Título 2 / Título 3 |

A lista completa está em **Ferramentas → Atalhos de Teclado**.
