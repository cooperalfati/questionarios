/* Assistente de IA para administradores (Gemini via Firebase AI Logic).
   Responde dúvidas sobre o uso do app e sobre os dados dos questionários. */
const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js';
const SDK_APPCHECK = 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
// chave de site do reCAPTCHA (Fraud Defense) do projeto: é pública, não é segredo
const RECAPTCHA_SITE = '6Lf-RzIuAAAAAJePMETZhDktp-H4tNKzGAMWdK95';
// modelos tentados em ordem (o primeiro disponível é usado).
// Camada gratuita: o Flash tem cota diária pequena; ao esgotar, o Flash-Lite (cota maior) assume.
const MODELOS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
const LIMITE_CONTEXTO = 400000;   // caracteres de dados enviados à IA

const MANUAL = `
# Manual do app "Perguntas e Respostas" (Cooperativa Alfa)

## Visão geral
App web para criar questionários, convidar pessoas por e-mail e acompanhar as respostas.
- Administradores entram com a conta Google (botão "Entrar com Google"). Só e-mails cadastrados como administradores têm acesso; os demais veem "Acesso restrito".
- Convidados NÃO fazem login: respondem pelo link pessoal recebido no e-mail.
- Abas do administrador: "Questionários" (lista e editor) e "Respostas". A tela "Convidados" abre pelo botão "Convidados" no cartão de cada questionário.

## Aba Questionários
- Lista os questionários com título, situação (Aberto/Fechado), número de perguntas e de respostas e a data da última alteração.
- Botões de cada cartão: "Editar", "Convidados", "Respostas", "Duplicar" (cria uma cópia fechada para respostas) e "Excluir" (pede confirmação; apaga o questionário).
- "Novo questionário" abre o editor vazio. "Importar JSON" permite colar o conteúdo de um arquivo .json de questionário (com "blocos" ou "perguntas"); o importado começa fechado para respostas.

## Editor de questionário
- Campos: título (obrigatório), descrição/orientação para quem vai responder e a opção "Aberto para respostas". Questionário fechado não aceita novas respostas pelo link.
- Blocos: separam assuntos dentro do mesmo questionário. Cada bloco tem título (obrigatório) e descrição opcional, pode ser movido para cima/baixo ou excluído (excluir remove as perguntas dele). Não é permitido bloco sem perguntas.
- Perguntas: texto (obrigatório), tipo de resposta, "Obrigatória" (sim/não), texto de ajuda opcional. Podem ser movidas para cima/baixo, trocadas de bloco e excluídas.
- Tipos de resposta: Opções simples (uma escolha, mínimo 2 opções), Opções múltiplas (várias escolhas), Texto, Número e Data.
- Sub-perguntas condicionais ("+ Sub-pergunta condicional"): aparecem só quando a resposta da pergunta de cima atende a uma condição. Podem ter vários níveis (sub-pergunta de sub-pergunta). Numeração: 1, 1.1, 1.1.1...
  - Condições por tipo da pergunta de cima:
    - Opções simples: for / não for (uma opção), for respondida.
    - Opções múltiplas: incluir / não incluir (uma opção), for respondida.
    - Número: maior que, maior ou igual, menor que, menor ou igual, igual, diferente, for preenchida.
    - Texto: for preenchida, for igual a, contiver.
    - Data: for preenchida, antes de, depois de, igual a.
- Recolher/expandir: cada pergunta tem o botão ▸/▾ para esconder os detalhes e mostrar só o resumo (tipo, obrigatória, opções, nº de sub-perguntas). Há "Recolher todas" e "Expandir todas". Ao abrir um questionário existente, as perguntas começam recolhidas; ao salvar com erro, as perguntas com problema se abrem sozinhas.
- Pré-visualização: mostra o questionário como o convidado verá; dá para responder para testar as sub-perguntas (nada é salvo).
- "Salvar questionário" valida tudo (título, textos, opções, condições) e lista os erros a corrigir. Ao sair com alterações não salvas, o app avisa ("Sair sem salvar?" / "Descartar alterações").

## Convidados (por questionário)
- "Adicionar e-mails": cole uma lista (separada por vírgula, ponto e vírgula ou um por linha; pode vir do Excel ou Outlook). O app separa os endereços e ignora repetidos.
- Cada convidado recebe um link pessoal (#r-...). O link identifica a pessoa; ela não precisa de login. Não deve ser encaminhado.
- Mensagem do convite: assunto e texto editáveis; use {titulo} para o nome do questionário e {link} para o link pessoal ({link} é obrigatório). "Salvar mensagem" e "Restaurar texto padrão".
- Envio: "Enviar para quem ainda não recebeu" e "Reenviar aos pendentes" (quem recebeu e ainda não respondeu). O envio sai do Gmail do administrador logado, um e-mail por pessoa; no primeiro envio o Google pede autorização ("Enviar e-mail em seu nome"). Se o navegador bloquear a janela, é preciso permitir pop-ups.
- Sem Gmail: "Copiar e-mails e links dos pendentes" e "Copiar link" de cada pessoa, para enviar por outro meio.
- Tabela "Lista de convidados": e-mail, Situação (Respondeu ou Pendente), data do convite enviado (ou "Não enviado"), "Copiar link" e "Remover" (pede confirmação; o link pessoal dele deixa de valer).
- Limites: o Gmail tem limite diário de envios; se atingir, espere e use "Enviar para quem ainda não recebeu".

## Respondendo (convidado)
- Ao abrir o link, a pessoa vê o questionário, responde e clica "Enviar resposta". Pode voltar pelo mesmo link para ver ou alterar ("Atualizar resposta") enquanto o questionário estiver aberto.
- Perguntas obrigatórias precisam ser respondidas ("Faltam N perguntas obrigatórias"). Sub-perguntas só aparecem quando a condição é atendida.
- Link inválido ou questionário fechado/removido mostram uma mensagem e não aceitam resposta.

## Aba Respostas
- Escolha o questionário. Indicadores: Respostas recebidas, Perguntas principais (sem contar sub-perguntas), Última resposta e Situação.
- "Resumo por pergunta": contagem e percentual por opção; para números, mínimo, máximo, média e soma; para textos e datas, lista de respostas.
- "Respostas individuais": participante (e-mail), data de envio, perguntas principais respondidas e "Ver respostas" com o detalhe.
- "Copiar tabela (CSV)": copia todas as respostas em formato CSV (separado por ponto e vírgula) para colar no Excel.

## Segurança e dados
- Os dados ficam no Firebase (Firestore) do projeto questionarios-cooperalfa. Só administradores leem respostas e convites. Cada convidado só consegue gravar a própria resposta pelo seu link.
- A lista de administradores é mantida no Firebase (documento config/admins); para incluir ou remover administradores, peça a quem administra o projeto.
`.trim();

const REGRAS = `
Você é o assistente do app "Perguntas e Respostas" da Cooperativa Alfa, usado por administradores.
- Responda sempre em português do Brasil, de forma curta, clara e prática (passo a passo quando for "como fazer").
- Use o MANUAL para dúvidas de funcionamento e os DADOS ATUAIS para perguntas sobre questionários, convidados e respostas.
- Baseie-se apenas no manual e nos dados abaixo. Se a informação não estiver neles, diga que não sabe; não invente recursos, números ou nomes.
- Ao citar números (respostas, pendentes etc.), conte a partir dos dados. Ao listar pessoas, use os e-mails.
- Você não executa ações no app (não envia e-mails, não altera questionários); explique como o administrador faz.
- Formatação: texto simples, listas com "- " e **negrito** quando ajudar. Sem tabelas largas.
`.trim();

let api = null;          // {getAI, getGenerativeModel, GoogleAIBackend}
let modeloIdx = 0;
let historico = [];      // [{role:'user'|'model', parts:[{text}]}]
let ocupado = false;

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
function markdown(txt){
  const linhas = esc(txt).split('\n');
  let html = '', lista = null;
  const fecha = () => { if (lista){ html += `</${lista}>`; lista = null; } };
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  for (const l of linhas){
    let m;
    if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))){ if (lista !== 'ul'){ fecha(); html += '<ul>'; lista = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))){ if (lista !== 'ol'){ fecha(); html += '<ol>'; lista = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = /^#{1,4}\s+(.*)$/.exec(l))){ fecha(); html += `<p><b>${inline(m[1])}</b></p>`; }
    else if (!l.trim()){ fecha(); }
    else { fecha(); html += `<p>${inline(l)}</p>`; }
  }
  fecha();
  return html;
}

function mensagemErro(e){
  const t = String((e && (e.message || e.code)) || e || '');
  if (/app.?check/i.test(t)) return 'A IA recusou a chamada por falta de verificação do App Check. É preciso concluir a configuração do App Check no Firebase.';
  if (/high demand|overloaded|\b50[0-9]\b/i.test(t)) return 'O serviço de IA está sobrecarregado no momento. Tente de novo em instantes.';
  if (/\b429\b|quota|exhausted|rate.?limit/i.test(t)) return 'O limite gratuito de uso da IA foi atingido. Se for o limite por minuto, tente de novo em instantes; o limite diário renova por volta das 5h (horário de Brasília).';
  if (/api.?not.?enabled|has not been used|disabled|403/i.test(t)) return 'A IA ainda não está ativada no projeto do Firebase (Firebase AI Logic).';
  if (/fetch|network|Failed to/i.test(t)) return 'Sem conexão com o serviço de IA. Verifique a internet e tente de novo.';
  return 'Não foi possível obter a resposta agora (' + t.slice(0, 160) + ').';
}

export function montarAssistente({app, contexto, quem}){
  if (document.getElementById('ia-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'ia-fab'; fab.type = 'button'; fab.className = 'ia-fab';
  fab.setAttribute('aria-label', 'Abrir o assistente de IA');
  fab.innerHTML = '<span aria-hidden="true">✦</span> Assistente';

  const painel = document.createElement('section');
  painel.id = 'ia-painel'; painel.className = 'ia-painel'; painel.hidden = true;
  painel.setAttribute('aria-label', 'Assistente de IA');
  painel.innerHTML = `
    <header class="ia-top">
      <div><b>Assistente</b><small>Dúvidas sobre o app e os seus questionários</small></div>
      <div class="ia-acts">
        <button type="button" class="btn sm" id="ia-nova">Nova conversa</button>
        <button type="button" class="icon" id="ia-fechar" aria-label="Fechar o assistente">✕</button>
      </div>
    </header>
    <div class="ia-msgs" id="ia-msgs" aria-live="polite"></div>
    <form class="ia-form" id="ia-form">
      <textarea id="ia-txt" rows="2" placeholder="Pergunte, por exemplo: Quem ainda não respondeu o levantamento?" aria-label="Sua pergunta"></textarea>
      <button type="submit" class="btn primary" id="ia-env">Enviar</button>
    </form>
    <p class="ia-aviso">Respostas geradas por IA (Google Gemini) podem conter erros. Para responder, os dados dos questionários e respostas são enviados ao Google. Protegido pelo reCAPTCHA: aplicam-se a <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Política de Privacidade</a> e os <a href="https://policies.google.com/terms" target="_blank" rel="noopener">Termos de Serviço</a> do Google.</p>`;
  document.body.append(fab, painel);

  const msgs = painel.querySelector('#ia-msgs');
  const txt = painel.querySelector('#ia-txt');
  const env = painel.querySelector('#ia-env');

  const boasVindas = () => {
    msgs.replaceChildren();
    adicionar('model', `Olá${quem ? ', ' + quem.split(' ')[0] : ''}! Posso explicar como usar o app e consultar os questionários, convidados e respostas. Exemplos:\n- Como crio uma sub-pergunta condicional?\n- Quem ainda não respondeu?\n- Qual opção foi mais escolhida na pergunta 2?`, true);
    const sug = document.createElement('div');
    sug.className = 'ia-sug';
    for (const s of ['Como envio os convites?', 'Quem ainda não respondeu?', 'Resuma as respostas recebidas']){
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip-res'; b.textContent = s;
      b.addEventListener('click', () => { txt.value = s; perguntar(); });
      sug.append(b);
    }
    msgs.append(sug);
  };
  function adicionar(role, texto, semHistorico){
    const d = document.createElement('div');
    d.className = 'ia-msg ' + (role === 'user' ? 'eu' : 'ia');
    if (role === 'user') d.textContent = texto; else d.innerHTML = markdown(texto);
    msgs.append(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  async function modelo(i){
    if (!api){
      // App Check: comprova que a chamada vem deste site antes de liberar a IA
      try {
        const ac = await import(SDK_APPCHECK);
        ac.initializeAppCheck(app, {provider:new ac.ReCaptchaEnterpriseProvider(RECAPTCHA_SITE), isTokenAutoRefreshEnabled:true});
      } catch (e){ console.warn('[assistente] App Check', e); }
      const m = await import(SDK);
      api = {getAI:m.getAI, getGenerativeModel:m.getGenerativeModel, GoogleAIBackend:m.GoogleAIBackend};
    }
    const ai = api.getAI(app, {backend:new api.GoogleAIBackend()});
    let dados = contexto();
    if (dados.length > LIMITE_CONTEXTO) dados = dados.slice(0, LIMITE_CONTEXTO) + '\n[... dados cortados por tamanho ...]';
    const agora = new Date().toLocaleString('pt-BR');
    return api.getGenerativeModel(ai, {
      model:MODELOS[i],
      systemInstruction:`${REGRAS}\n\nData e hora atual: ${agora}.\n\n=== MANUAL ===\n${MANUAL}\n\n=== DADOS ATUAIS ===\n${dados}`,
      generationConfig:{temperature:0.2}
    });
  }

  async function perguntar(){
    const p = txt.value.trim();
    if (!p || ocupado) return;
    ocupado = true; env.disabled = true; txt.value = '';
    const sug = msgs.querySelector('.ia-sug'); if (sug) sug.remove();
    adicionar('user', p);
    const bolha = adicionar('model', '…');
    bolha.classList.add('pensando');
    let resposta = '';
    try {
      for (let i = modeloIdx; ; i++){
        try {
          const m = await modelo(i);
          const chat = m.startChat({history:historico});
          const r = await chat.sendMessageStream(p);
          for await (const parte of r.stream){
            resposta += parte.text();
            bolha.classList.remove('pensando');
            bolha.innerHTML = markdown(resposta);
            msgs.scrollTop = msgs.scrollHeight;
          }
          break;
        } catch (e){
          // modelo inexistente (404) ou sobrecarregado (5xx): tenta o próximo da lista
          const msg = String(e && e.message);
          if (!resposta && i < MODELOS.length - 1){
            // inexistente ou cota diária esgotada: passa ao próximo e mantém para as próximas perguntas
            if (/\b404\b|not.?found|not supported|\b429\b|quota|exhausted/i.test(msg)){ modeloIdx = i + 1; continue; }
            if (/\b50[0-9]\b|high demand|overloaded|unavailable/i.test(msg)) continue;
          }
          throw e;
        }
      }
      if (!resposta.trim()) throw new Error('resposta vazia');
      historico.push({role:'user', parts:[{text:p}]}, {role:'model', parts:[{text:resposta}]});
      if (historico.length > 30) historico = historico.slice(-30);
    } catch (e){
      console.error('[assistente]', e);
      bolha.classList.remove('pensando');
      bolha.classList.add('erro');
      bolha.textContent = mensagemErro(e);
    } finally {
      ocupado = false; env.disabled = false; txt.focus();
    }
  }

  const abrir = v => { painel.hidden = !v; fab.hidden = v; if (v){ if (!msgs.childElementCount) boasVindas(); txt.focus(); } else fab.focus(); };
  fab.addEventListener('click', () => abrir(true));
  painel.querySelector('#ia-fechar').addEventListener('click', () => abrir(false));
  painel.querySelector('#ia-nova').addEventListener('click', () => { historico = []; boasVindas(); txt.focus(); });
  painel.querySelector('#ia-form').addEventListener('submit', e => { e.preventDefault(); perguntar(); });
  txt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); perguntar(); } });
  painel.addEventListener('keydown', e => { if (e.key === 'Escape') abrir(false); });
}
