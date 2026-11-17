# Assistente de IA

O assistente é um ajudante que vive dentro do editor. Tu dizes-lhe, por palavras tuas, o que queres mudar no livro, e ele faz o trabalho chato por ti: procurar, corrigir e uniformizar.

> **A regra de ouro: o assistente nunca mexe no livro sem tu deixares.** Primeiro mostra o que pretende fazer (uma *proposta*). Só depois de carregares em **Aplicar** é que o livro muda. E se te arrependeres, há sempre **Reverter**.

---

## 1. Como abrir e usar

1. No editor, carrega no botão **IA** (na barra por cima do texto). Abre-se um painel do lado direito.
2. Escreve o que queres numa frase normal, como falarias com um colega. Carrega em **Enter** para enviar.
3. O assistente responde e, se o pedido implicar alterações, aparece uma caixa **Proposta** com o resumo do que vai mudar.
4. Lê a proposta. Se estiver bem, carrega em **Aplicar**. Se não, em **Descartar** (nada acontece).

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
- **Em modo de leitura** (quando outra pessoa está a editar o mesmo livro) o botão Aplicar fica desativado.
- **Pode enganar-se.** Lê sempre a proposta. É para isso que ela existe.

---

## 8. Dicas

- **Sê concreto.** *«Centra os parágrafos que só têm um asterisco»* é melhor do que *«arruma isto»*.
- **Um assunto de cada vez.** Pedidos pequenos são mais fáceis de rever e de reverter.
- **Se a proposta não for o que querias**, carrega em **Descartar** e explica melhor, ou diz logo *«não, só nos capítulos 2 e 3»*.
- **Em caso de dúvida, pergunta primeiro.** *«O que é que mudarias para uniformizar os títulos?»* — ele responde sem mexer em nada.
- **Experimenta num bloco primeiro.** Seleciona um parágrafo, aplica, vê se ficou como queres, e só depois pede para o livro todo.

