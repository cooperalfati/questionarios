# Perguntas e Respostas · Cooperativa Alfa

**No ar (projeto de testes):** https://ronyperuzzo.github.io/questionarios/

- Site: GitHub Pages (este repositório, branch `main`, pasta raiz).
- Login e banco: Firebase, projeto `questionarios-cooperalfa` (plano gratuito Spark).
- Para atualizar o site, edite os arquivos aqui no GitHub. A publicação é automática em cerca de 1 minuto.

App web de questionários com login Google. É um site estático (HTML + JavaScript, sem etapa de build) que usa:

- **Firebase Authentication**: botão "Entrar com Google".
- **Cloud Firestore**: banco de dados, protegido pelas regras em `firestore.rules`.
- **Firebase Hosting**: hospedagem (pode ser trocada por qualquer servidor de arquivos estáticos com HTTPS).
- **API do Gmail**: o administrador envia os convites pela própria conta Google, direto do navegador.

Não há servidor próprio para manter.

## Estrutura

```
index.html                          página
styles.css                          visual
app.js                              aplicação
firebase-config.js                  configuração do projeto Firebase
firestore.rules                     regras de segurança do banco (cópia do que está publicado no Firebase)
levantamento-tecnico-2026.json      questionário exportado do protótipo (para importar)
```

## Implantação do zero em outro projeto (referência)

### 1. Projeto Firebase
1. Acesse https://console.firebase.google.com e crie um projeto (por exemplo, `cooperalfa-questionarios`).
2. **Authentication → Método de login → Google → Ativar.**
3. **Firestore Database → Criar banco de dados**, em modo de produção, região `southamerica-east1` (São Paulo).
4. **Configurações do projeto → Seus apps → Adicionar app da Web.** Copie o objeto `firebaseConfig` para `public/firebase-config.js`.

### 2. Envio de e-mail pelo Gmail
O projeto Firebase também é um projeto do Google Cloud. Em https://console.cloud.google.com, com o mesmo projeto selecionado:

1. **APIs e serviços → Biblioteca → Gmail API → Ativar.**
2. **APIs e serviços → Tela de consentimento OAuth.**
   - Se a Cooperalfa usa **Google Workspace**, escolha o tipo **Interno**. Não precisa de verificação do Google.
   - Senão, escolha **Externo**, deixe em **Teste** e inclua em "Usuários de teste" as contas dos administradores que vão enviar convites. Só essas contas recebem a permissão de envio. Quem só responde não precisa estar na lista.
   - Em **Escopos**, adicione `https://www.googleapis.com/auth/gmail.send`.

O escopo do Gmail é pedido apenas quando um administrador clica em "Enviar". Quem só responde concede somente nome e e-mail.

### 3. Primeiro administrador
No Firestore, crie manualmente:

- Coleção `config` → documento `admins`
- Campo `emails` (tipo *array*) com os e-mails dos administradores **em minúsculas**, por exemplo `rony.peruzzo@cooperalfa.coop.br`.

Para adicionar ou remover administradores depois, edite essa lista.

### 4. Publicar
Com Node.js instalado:

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # escolha o projeto criado
firebase deploy               # publica o site e as regras do Firestore
```

O endereço fica `https://<projeto>.web.app`. Para usar um domínio próprio (por exemplo `questionarios.cooperalfa.coop.br`), configure em **Hosting → Adicionar domínio personalizado** e inclua o domínio em **Authentication → Configurações → Domínios autorizados**.

Se preferir hospedar em servidor próprio, copie a pasta `public/` para qualquer servidor HTTPS, adicione o domínio em "Domínios autorizados" e publique as regras com `firebase deploy --only firestore:rules`.

### 5. Trazer o questionário do protótipo
Entre como administrador, vá em **Questionários → Importar JSON** e cole o conteúdo de `levantamento-tecnico-2026.json`. O questionário começa fechado. Abra-o no editor e marque "Aberto para respostas".

## Como funciona

| Quem | O que faz |
|---|---|
| Administrador (e-mail em `config/admins`) | Cria e edita questionários (blocos, 5 tipos de resposta, sub-perguntas condicionais), cadastra convidados, envia convites pelo Gmail e vê o relatório |
| Qualquer conta Google | Abre o link, entra com Google e responde |

- **Link direto:** `https://<endereço>/#q-<id>` abre o questionário. Se a pessoa ainda não entrou, o app pede o login e depois abre o questionário.
- **Somente convidados:** opção no editor. Quando marcada, o banco só aceita respostas de e-mails que estão na lista de convidados. A regra é aplicada no Firestore, não só na tela.
- **Uma resposta por pessoa:** cada resposta fica em `respostas/<idQuestionario>_<uid>`. Reenviar substitui a anterior.
- **Convites:** cada pessoa recebe um e-mail separado, enviado pela conta do administrador. O app marca a data de envio e mostra quem já respondeu.

## Limites a conhecer
- O Gmail limita o envio diário: cerca de 500 e-mails por dia em contas comuns e 2.000 no Google Workspace.
- A autorização de envio dura cerca de 1 hora. Depois disso, o app pede de novo no próximo clique.
- O navegador precisa permitir pop-ups do site para as janelas do Google. No celular, se o pop-up for bloqueado, o login cai para o modo de redirecionamento.
