import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

async function runChromeDiagnosis() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tmpDir = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'chrome_geo_diag_' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log('================================================================');
  console.log('RUNLOOP — DIAGNÓSTICO COMPLETO DA GEOLOCALIZAÇÃO NO GOOGLE CHROME');
  console.log('================================================================');
  console.log('Iniciando Google Chrome headless com CDP ativo na porta 9222...');

  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${tmpDir}`,
    'http://localhost:8088/index.html'
  ], { stdio: 'ignore' });

  // Aguarda Chrome inicializar
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) break;
    } catch {}
  }

  try {
    const listRes = await fetch('http://127.0.0.1:9222/json');
    const tabs = await listRes.json();
    const target = tabs.find(t => t.type === 'page' && t.url.includes('localhost:8088')) || tabs[0];
    console.log('Página conectada:', target.url);

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    let msgId = 1;
    const consoleLogs = [];

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    // Escuta eventos de console
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        const type = data.params.type;
        const text = data.params.args.map(a => a.value !== undefined ? a.value : JSON.stringify(a)).join(' ');
        consoleLogs.push({ type, text });
      }
    });

    await send('Runtime.enable');
    await send('Page.enable');

    // Concede permissão de geolocalização para a origem http://localhost:8088
    await send('Browser.grantPermissions', {
      origin: 'http://localhost:8088',
      permissions: ['geolocation']
    });

    // Aguarda carregamento total da página
    await new Promise(r => setTimeout(r, 1000));

    // 1. Diagnóstico de Ambiente
    console.log('\n[1. DIAGNÓSTICO DO AMBIENTE]:');
    const envDiag = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        isSecureContext: window.isSecureContext,
        hasGeolocation: 'geolocation' in navigator,
        hasPermissions: 'permissions' in navigator
      })`,
      returnByValue: true
    });
    console.log(JSON.parse(envDiag.result.value));

    // 2. Consulta da Permissions API
    console.log('\n[2. CONSULTA PERMISSIONS API]:');
    const permDiag = await send('Runtime.evaluate', {
      expression: `navigator.permissions.query({name: 'geolocation'}).then(p => p.state)`,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('navigator.permissions.query({name: "geolocation"}):', permDiag.result.value);

    // 3. Chamada Mínima e Isolada: enableHighAccuracy: false
    console.log('\n[3. TESTE CHAMADA MÍNIMA E ISOLADA - enableHighAccuracy: false]:');
    const testIsolatedFalse = await send('Runtime.evaluate', {
      expression: `window.runLoopGeo.testIsolatedGeolocation({
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 0
      })`,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Resultado (enableHighAccuracy: false):', testIsolatedFalse.result.value);

    // 4. Chamada Mínima e Isolada: enableHighAccuracy: true
    console.log('\n[4. TESTE CHAMADA COM enableHighAccuracy: true]:');
    const testIsolatedTrue = await send('Runtime.evaluate', {
      expression: `window.runLoopGeo.testIsolatedGeolocation({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      })`,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Resultado (enableHighAccuracy: true):', testIsolatedTrue.result.value);

    // 5. Teste do Fluxo Real da Aplicação (Clicando no Botão "Usar minha localização")
    console.log('\n[5. TESTE DO FLUXO COMPLETO VIA BOTÃO NA UI]:');
    console.log('Clicando em #btn-use-location...');
    await send('Runtime.evaluate', {
      expression: `document.getElementById('btn-use-location').click()`
    });

    // Aguarda o término da chamada (até 16s para aguardar timeout/retorno)
    console.log('Aguardando resposta do navegador e atualização da UI...');
    await new Promise(r => setTimeout(r, 16000));

    // Inspeciona o estado da UI do RunLoop
    const uiStateResult = await send('Runtime.evaluate', {
      expression: `JSON.stringify({
        appState: window.runLoopUI ? window.runLoopUI.currentAppState : document.getElementById('loading-state').hidden ? 'NOT_LOADING' : 'LOADING',
        loadingHidden: document.getElementById('loading-state').hidden,
        errorHidden: document.getElementById('error-card').hidden,
        errorTitle: document.getElementById('error-title').textContent,
        errorDesc: document.getElementById('error-desc').textContent,
        startCoordsBadge: document.getElementById('start-coords-badge').textContent
      })`,
      returnByValue: true
    });
    console.log('\n[ESTADO FINAL DA INTERFACE DO RUNLOOP]:');
    console.log(JSON.parse(uiStateResult.result.value));

    // Exibe logs de console capturados da aplicação
    console.log('\n[LOGS DE CONSOLE DO RUNLOOP CAPTURADOS]:');
    consoleLogs.filter(l => l.text.includes('[RunLoop GEO') || l.text.includes('GEO')).forEach(l => {
      console.log(`  [${l.type}] ${l.text}`);
    });

    ws.close();
  } finally {
    proc.kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

runChromeDiagnosis().catch(err => {
  console.error('Falha geral no teste:', err);
  process.exit(1);
});
