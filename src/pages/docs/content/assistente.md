# Assistente de IA

O assistente é um ajudante que vive dentro do editor. Tu dizes-lhe, por palavras tuas, o que queres mudar no livro, e ele faz o trabalho chato por ti: procurar, corrigir e uniformizar.

> **A regra de ouro: o assistente nunca mexe no livro sem tu deixares.** Primeiro mostra o que pretende fazer (uma *proposta*). Só depois de carregares em **Aplicar** é que o livro muda. E se te arrependeres, há sempre **Reverter**. (Só há uma exceção, e o assistente pergunta antes: comprimir imagens, na secção 3.10.)

---

## 1. Como abrir e usar

1. No editor, carrega no botão **IA** (na barra por cima do texto). Abre-se um painel do lado direito.
2. Escreve o que queres numa frase normal, como falarias com um colega. Carrega em **Enter** para enviar.
3. O assistente responde e, se o pedido implicar alterações, aparece uma caixa **Proposta** com o resumo do que vai mudar.
4. Lê a proposta. Se estiver bem, carrega em **Aplicar**. Se não, em **Descartar** (nada acontece).

### Ver a proposta antes de aplicar

A proposta tem dois separadores:

- **Exemplo** (aparece primeiro): mostra a alteração **desenhada**, com o aspeto real do livro. Serve para o que se vê, como a cor de um texto ou um fundo. Num estilo novo vês o *depois*; num estilo alterado, o *antes* e o *depois* lado a lado; nas regras, um exemplo (o primeiro) de cada regra.
- **Código**: o detalhe em texto: as regras, as operações (por exemplo a tipografia), os estilos com o valor antigo e o novo, e exemplos do HTML antes e depois.

Há alterações que não têm exemplo desenhado (trocar texto, tipografia, mexer em capítulos): ficam no resumo em texto.

### Pequenos atalhos

- Enquanto trabalha, o painel diz o que está a fazer («A ler o livro…», «A comparar os estilos com o PDF…») e há um botão **Parar** que cancela o pedido.
- Na caixa de escrita, **↑** (no início do texto) e **↓** (no fim) percorrem os pedidos anteriores. Se um pedido falhar, o texto volta à caixa e não tens de o escrever de novo.
- As respostas podem trazer botões azuis. **Cap. 12 ▸** leva o editor ao capítulo (e ao bloco) citado. **p. 79 ▸** abre o PDF de impressão nessa página **e** leva o editor ao mesmo ponto. Se o livro não tiver o marcador dessa página, só o PDF se move.

Os ícones no topo do painel:

| Ícone | Para que serve |
|---|---|
| Imagem | Texto alternativo das imagens (ver secção 5) |
| Relógio com seta | **Alterações da IA**: a lista de tudo o que já foi aplicado, com o botão Reverter |
| Caixote do lixo | Começar uma conversa nova |
| X | Fechar o painel |

A conversa fica guardada: se fechares o separador e voltares, ela continua lá. (Uma proposta que ainda não tinhas aplicado perde-se; é só pedir de novo.)

---

## 2. Trabalhar no livro todo ou só num bocado

Por omissão, o assistente olha para **o livro inteiro**.

Se só queres mexer numa parte, **seleciona no editor** os parágrafos que interessam (um ou vários, com o rato). Esses blocos ficam destacados no texto e aparece por cima da caixa de escrita um aviso amarelo: *«Só os 3 blocos destacados»*. O assistente só toca nesses.

Para voltar ao livro todo, carrega no "X" desse aviso amarelo.

**Exemplos**

- Seleciono um parágrafo e escrevo: *«põe este parágrafo centrado e a negrito»* → só esse parágrafo muda.
- Seleciono cinco linhas de um poema e escrevo: *«recua estas linhas»* → só essas cinco.
- Não seleciono nada e escrevo: *«põe todas as citações em itálico»* → o livro todo.

---

## 3. O que o assistente sabe fazer

### 3.1 Mudar o aspeto de parágrafos e títulos

Funciona por *regras*: «a todos os parágrafos que sejam assim, será replicado».

**Exemplos**

- *«Tira o avanço da primeira linha dos parágrafos que vêm logo a seguir a um título.»*
- *«Centra todos os parágrafos que são só uma linha em negrito.»*
- *«Os parágrafos com a letra pequena passam a letra normal.»*
- *«Nos capítulos 3 a 5, põe os parágrafos com avanço.»*
- *«Apaga os parágrafos vazios.»*
- *«Transforma os parágrafos a negrito em subtítulos.»*

### 3.2 Criar um estilo novo

Se o aspeto que pedes ainda não existe, o assistente cria um estilo novo e usa-o. Na proposta aparece o nome do estilo e podes **mudar-lhe o nome** antes de aplicar.

**Exemplos**

- *«Cria um estilo para as notas do editor: letra cinzenta, mais pequena e em itálico, e aplica-o aos parágrafos que começam por "Nota:".»*
- *«Quero um estilo de citação com um traço do lado esquerdo.»*

### 3.3 Alterar um estilo que já existe

Em vez de mexer parágrafo a parágrafo, muda-se o estilo e todos os parágrafos que o usam mudam de uma vez.

**Exemplos**

- *«Muda o fundo do estilo destaque de amarelo para roxo, mantendo o resto.»*
- *«Faz as citações 10% mais pequenas.»*
- *«Os títulos de nível 2 devem ter a letra maior.»*

### 3.4 Apagar estilos que ninguém usa

Com o tempo ficam estilos esquecidos. O assistente descobre os que não estão aplicados em lado nenhum e apaga-os, **mas só se lho pedires**. Nunca apaga um estilo que esteja a ser usado.

**Exemplos**

- *«Apaga os estilos que ninguém usa.»*
- *«Quais os estilos que não estão a ser usados?»* (só responde; não apaga)

### 3.5 Trocar texto no livro inteiro

**Exemplos**

- *«Troca "Sr." por "Senhor" em todo o livro.»*
- *«Onde está "Lisboa, 1950" escreve "Lisboa, 1951".»*

### 3.6 Arrumar a tipografia

Corrige em todo o livro os pequenos descuidos de escrita:

- **Aspas** retas ou inglesas (" ") passam a aspas portuguesas « ».
- **Travessões** de diálogo e hífens soltos passam a travessões certos.
- **Reticências** escritas como três pontos (...) passam a um só sinal (…).
- **Espaços** a mais (dois seguidos, ou antes de uma vírgula) são limpos.

Mostra-te quantas alterações faz de cada tipo e um exemplo antes de aplicares.

**Exemplos**

- *«Corrige a tipografia.»* (faz as quatro coisas)
- *«Só quero corrigir as aspas.»*
- *«Tira os espaços a mais.»*
- *«Tens aí excesso de espaços?»*

> Nota: as aspas ficam sempre « ». Se um parágrafo tiver aspas que abrem e não fecham, o assistente deixa-o como está e avisa-te.

### 3.7 Mexer em capítulos

- Mudar o nome de um capítulo: *«Muda o nome do capítulo 4 para "O regresso".»*
- Mudar o nível de um capítulo: *«O capítulo 7 passa a ser um subcapítulo.»*
- Esconder um capítulo do Índice do EPUB: *«Esconde a Ficha Técnica do Índice.»*
- Capitulares (a primeira letra grande): *«Põe capitular no início de cada capítulo.»*

### 3.8 Ligar o Índice

*«Liga as entradas do Índice aos capítulos.»* — cada linha do Índice passa a levar o leitor ao capítulo certo.

### 3.9 Acertar o espaçamento das ligações

*«Corrige o espaçamento dos links.»* — acerta o espaçamento das ligações do livro. Mostra-te o resumo do que mudou antes de aplicares.

### 3.10 Comprimir imagens

Se o EPUB está pesado, o assistente reduz as imagens: as que forem **mais largas** que o limite passam a esse limite (nunca as aumenta) e são guardadas com menos qualidade. Por omissão, 1600 px de largura e qualidade 82; podes pedir outros valores (largura de 400 a 6000 px, qualidade de 40 a 95). Mostra no fim quanto poupou, antes e depois.

**Exemplos**

- *«Comprime as imagens.»*
- *«Reduz as imagens para 1200 px de largura.»*
- *«O ebook está pesado.»* → o assistente explica o que faria e **pergunta** se queres, antes de mexer.

> **Atenção:** é a única coisa que o assistente faz **sem Aplicar e sem Reverter**: os ficheiros das imagens são substituídos no servidor e **não se desfaz**. Por isso ele só comprime quando lho pedes. Fazer isto também está em Ferramentas → Auxílio → Compressão de Imagens.

---

## 4. Perguntas e verificações

O assistente também serve para **perguntar** e **conferir**.

Podes perguntar-lhe **como se faz** qualquer coisa na aplicação («como partilho um livro?», «onde importo um EPUB?»). Ele consulta estes mesmos guias e responde com os passos que lá estão; se o assunto não vier nos guias, diz-to em vez de inventar.

### 4.1 Auditoria: «o que está inconsistente?»

Procura incoerências na formatação do livro:

- títulos que saltam de nível (por exemplo, um nível 3 logo a seguir a um nível 1);
- parágrafos com formatação "à mão" que os vizinhos não têm;
- estilos criados mas nunca usados.

Explica por ordem de importância, diz o capítulo e dá um exemplo. Lembra sempre que **pode ser intencional**, porque quem decide és tu. Se não encontrar nada, diz só: *«A auditoria não detetou nenhum problema.»*

**Exemplos**

- *«Faz uma auditoria à formatação.»*
- *«Há parágrafos com formatação diferente dos outros?»*

### 4.2 Validações: «está tudo bem tecnicamente?»

O assistente corre por ti as verificações que estão no menu Validações e conta-te o resultado em linguagem simples:

- **Notas de rodapé** — todas as notas têm chamada e vice-versa?
- **Ligações** — há ligações partidas?
- **EPUB** — o ficheiro cumpre as regras do formato?
- **Acessibilidade** — o livro é utilizável por quem usa leitor de ecrã?

Quando é possível, propõe a correção (por exemplo, melhorar uma cor com pouco contraste, ou corrigir a ordem dos títulos).

**Exemplos**

- *«Corre todas as validações.»* → uma linha por validação: ✔ sem problemas ou ✘ com N problemas.
- *«O que falha na acessibilidade?»*
- *«Corrige os erros de acessibilidade.»*
- *«Valida as notas de rodapé.»*

### 4.3 «O livro está pronto?»

Faz uma lista de verificação antes de exportar: dados do livro (metadados), capa, texto alternativo das imagens, entradas do Índice, lista de páginas e as quatro validações acima. Cada item aparece como ✔ (ok), ✘ (falta), ⚠ (aviso) ou ℹ (informação), e diz onde resolver o que faltar.

**Exemplos**

- *«O livro está pronto?»*
- *«Posso exportar?»*
- *«Falta alguma coisa antes de publicar?»*

Se estiver tudo certo, responde só: *«Está tudo pronto para exportar.»*

### 4.4 Procurar no livro

*«Onde aparece "Stanley"?»* — mostra até 20 sítios, cada um com o capítulo, o tipo de bloco e um excerto, e um botão **Cap. N ▸** para saltares para lá. Também serve para contar: *«Quantas vezes escrevi "marketing"?»*

### 4.5 Comparar com o PDF de impressão

Se o livro tem o **PDF de impressão carregado** (painel do PDF, o ícone de página na barra do editor), o assistente compara o livro com ele. Sem PDF, diz-te que não consegue.

- **Lista de páginas** — *«Que páginas não têm marcador?»* Diz quantas páginas têm marcador e porque faltam as outras: em branco, do Índice, só figura, abre com figura, ou fora de ordem (as duas últimas são as que vale a pena rever). O botão **Corrigir lista de páginas** insere os marcadores que faltam.
- **Estilos** — *«Os estilos batem com o PDF?»* Compara os parágrafos soltos com o impresso: indentação, negrito/itálico, centrado, letra pequena e espaço acima. O botão **Corrigir estilos pelo PDF** aplica as diferenças (como sempre, primeiro vês a proposta). Só vê parágrafos soltos que encontra no PDF: caixas, listas, tabelas, citações, legendas, notas, Índice e ficha técnica ficam de fora.
- **Figuras** — *«As figuras estão no sítio certo?»* Compara a posição de cada figura **com legenda** («Figura 3.1 …») com a ordem do PDF e diz as que estão fora do sítio ou com a imagem e a legenda trocadas. No impresso as figuras flutuam para o topo ou o fundo da página, por isso só conta quando a diferença é de duas ou mais páginas. Para corrigir: *«Põe as figuras no sítio.»* Também podes pedir *«Junta cada figura à legenda»*, para não haver quebra de página entre as duas.
- **Texto** — *«O livro tem o mesmo texto que o impresso?»* Mostra as linhas do PDF que não encontra no livro, por página, cada uma com o botão **p. N ▸**. Ignora espaços, pontuação e hifenização. Só compara texto de corpo: páginas com colunas ou tabelas, texto de diagramas (que no livro são imagens), Índice, ficha técnica e cabeçalhos ficam de fora, e as notas de rodapé podem dar falsos positivos. Não há correção automática: o texto que falta repõe-se à mão.

### 4.6 Relatório de falhas

*«Prepara um relatório com todas as falhas.»* — o assistente junta a lista de verificação para publicar, a lista de páginas, os estilos e as figuras (contra o PDF) e as validações. Demora um pouco, porque corre as validações. No fim aparece o cartão **Relatório pronto**:

- **Abrir página** — abre o relatório bem organizado (secções, subtítulos e listas, com o capítulo e a página do PDF de cada falha) num separador novo. Fica num endereço do servidor que **não pede login**: quem o tiver abre-o. Só se guarda o último relatório de cada livro.
- **.txt** — descarrega o mesmo relatório em texto simples.

Sem PDF carregado, as secções que dependem dele ficam marcadas como não feitas.

---

## 5. Texto alternativo das imagens

O texto alternativo é uma frase curta que descreve a imagem para quem não a consegue ver (leitores de ecrã). É importante para a acessibilidade.

1. Carrega no ícone da **imagem** no topo do painel.
2. Vês todas as imagens do livro, com o texto atual (ou «sem texto»).
3. Podes escrever tu o texto, marcar a imagem como **Decorativa** (não precisa de descrição) ou carregar em **Gerar** para a IA sugerir um texto.
4. Para as imagens todas de uma vez: **Gerar com IA as N sem texto**. O assistente pede confirmação e diz quantas imagens vão ser enviadas.
5. Nada fica gravado até carregares em **Guardar**.

> **Privacidade:** para descrever uma imagem, ela e o texto à volta são enviados ao fornecedor de IA configurado. Por isso o assistente pede sempre a tua confirmação antes.

---

## 6. Desfazer: Reverter e Repor

Carrega no ícone do **relógio** para ver a lista **Alterações da IA**. Cada linha tem a data, quem fez, o pedido e o resumo do que mudou.

- **Reverter** — o livro volta a ficar como estava *antes* daquela alteração. Pede confirmação. Atenção: o que escreveste à mão **depois** dessa alteração perde-se (o estado atual fica guardado no histórico).
- **Repor** — aparece depois de reverter. Volta a aplicar a alteração, como se nunca a tivesses desfeito.

O assistente fica a saber que reverteste, por isso não se engana quando lhe pedires coisas a seguir.

**Exemplo completo**

1. Escreves: *«Cria um estilo chamado "teste" com cor vermelha.»* → Aplicar.
2. Escreves: *«Apaga os estilos que ninguém usa.»* → a proposta diz «Apagar estilo .teste (ninguém o usa)» → Aplicar.
3. Afinal querias o estilo! Relógio → **Reverter** na linha «apaga os estilos…» → Confirmar. O estilo voltou.

---

## 7. O que o assistente NÃO faz

Para não teres surpresas:

- **Não altera nada sem o teu Aplicar.** Sem exceções.
- **Não move, apaga nem cria capítulos.** Para isso usa o editor de capítulos. (Pode mudar-lhes o nome, o nível e esconder do Índice.)
- **Não mexe em títulos de nível 1 e 2** com regras em massa (apagar ou transformar), para não estragar a estrutura do livro.
- **Não corrige saltos de nível de título por conta própria** numa auditoria: diz-te onde estão e tu decides.
- **Não apaga estilos em uso**, nem apaga estilos sem lhe pedires.
- **Aspas só em « »**. Outros estilos de aspas não estão disponíveis.
- **A tipografia não funciona com blocos selecionados.** Tira o aviso amarelo (×) e pede de novo para o livro todo.
- **Comprimir imagens não se desfaz** e não passa pelo Aplicar (secção 3.10). É a única exceção.
- **Não corrige texto em falta** em relação ao PDF: mostra onde está a diferença e tu repões à mão.
- **As comparações com o PDF precisam do PDF carregado** no painel do PDF.
- **Em modo de leitura** (quando outra pessoa está a editar o mesmo livro) o botão Aplicar fica desativado.
- **Pode enganar-se.** Lê sempre a proposta. É para isso que ela existe.

---

## 8. Dicas

- **Sê concreto.** *«Centra os parágrafos que só têm um asterisco»* é melhor do que *«arruma isto»*.
- **Um assunto de cada vez.** Pedidos pequenos são mais fáceis de rever e de reverter.
- **Se a proposta não for o que querias**, carrega em **Descartar** e explica melhor, ou diz logo *«não, só nos capítulos 2 e 3»*.
- **Em caso de dúvida, pergunta primeiro.** *«O que é que mudarias para uniformizar os títulos?»* — ele responde sem mexer em nada.
- **Experimenta num bloco primeiro.** Seleciona um parágrafo, aplica, vê se ficou como queres, e só depois pede para o livro todo.

