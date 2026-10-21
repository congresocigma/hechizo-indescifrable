import { firebaseConfig } from './firebase-config.js';

/* El Hechizo Indescifrable · Una Noche Para Morirse
 * En modo demostración guarda las salas en este navegador; con Firebase
 * Realtime Database + Anonymous Auth sincroniza los 4 celulares.
 */

const PUZZLES = [
  { q:'Lo que te ASOMBRA esconde aquello que te sigue por los pasillos iluminados.', a:'SOMBRA', h1:'Es una silueta oscura que te acompaña cuando hay luz.', h2:'Buscá seis letras consecutivas dentro de ASOMBRA.', explain:'ASOMBRA esconde SOMBRA desde la segunda letra.' },
  { q:'Una doctora abreviada y la CULPA sin la primera del PÁNICO forman al conde que teme al sol.', a:'DRÁCULA', h1:'Es un famoso conde vampiro.', h2:'DRA. + CULPA sin la P.', explain:'DRA + CULA (CULPA menos P) = DRÁCULA.' },
  { q:'AQUEL, seguido de la orden para apurar a un caballo, reúne a las brujas a medianoche.', a:'AQUELARRE', h1:'Es una reunión de brujas.', h2:'Uní AQUEL con la exclamación «ARRE».', explain:'AQUEL + ARRE = AQUELARRE.' },
  { q:'Una degustación seguida de una CUMBIA sin su I te lleva a un cementerio subterráneo.', a:'CATACUMBA', h1:'Es una galería funeraria subterránea.', h2:'CATA + CUMBIA sin la I.', explain:'CATA + CUMBA = CATACUMBA.' },
  { q:'Un SECRETO y el comienzo del PÁNICO, revueltos, dan una aparición fantasmal.', a:'ESPECTRO', h1:'Es otra palabra para fantasma.', h2:'Reordená las letras de SECRETO + P.', explain:'SECRETO + P es un anagrama de ESPECTRO.' },
  { q:'Un HECHO, el uno romano y el final de la LUZ, mezclados, producen magia oscura.', a:'HECHIZO', h1:'Es una acción o fórmula de magia.', h2:'Mezclá HECHO + I + Z.', explain:'HECHO + I + Z se reorganiza como HECHIZO.' },
  { q:'El CEMENTO, la nota que sigue al DO y el uno romano, revueltos, te llevan a un campo de lápidas.', a:'CEMENTERIO', h1:'Es un lugar de enterramientos.', h2:'Anagrama: CEMENTO + RE + I.', explain:'CEMENTO + RE + I forma CEMENTERIO.' },
  { q:'Un POTRO, un CLAN y el uno romano, todos revueltos, revelan a quien se transforma bajo la luna llena.', a:'LICÁNTROPO', h1:'Es otro nombre del hombre lobo.', h2:'Anagrama: POTRO + CLAN + I.', explain:'POTRO + CLAN + I forma LICÁNTROPO.' },
  { q:'Un SACO, un FARO y la cabeza de un GUARDIÁN, todos revueltos, forman el ataúd de un faraón.', a:'SARCÓFAGO', h1:'Es un recipiente funerario, a menudo de piedra.', h2:'Anagrama: SACO + FARO + G.', explain:'SACO + FARO + G forma SARCÓFAGO.' },
  { q:'Un ROMANCE, una agencia de espías estadounidense y el NORTE, todos revueltos, forman el arte de comunicarse con los muertos.', a:'NECROMANCIA', h1:'Es una práctica adivinatoria vinculada con los muertos.', h2:'Anagrama: ROMANCE + CIA + N.', explain:'ROMANCE + CIA + N forma NECROMANCIA.' }
];
const TEAM_IDS = ['brujos','fantasmas','vampiros','licantropos'];
const TEAMS = {
  brujos:{name:'Brujos',icon:'🧙',color:'#bda5e5'},
  fantasmas:{name:'Fantasmas',icon:'👻',color:'#cbdfe9'},
  vampiros:{name:'Vampiros',icon:'🧛',color:'#eb9a9a'},
  licantropos:{name:'Licántropos',icon:'🐺',color:'#b6d4a3'}
};
const POINTS = [5,3,1];
const app = document.getElementById('app');
const hasConfig = ['apiKey','projectId','databaseURL','appId'].every(k=>firebaseConfig[k] && !firebaseConfig[k].includes('REEMPLAZAR'));
const isDemo = !hasConfig;
let db = null, api = null, uid = null, room = null, roomCode = null;
let unsub = null, lastScreen = null, busy = false, sound = false, toastTimeout = null;
let soundContext;

function escapeHTML(input){return String(input??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function normalize(input){return String(input||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-ZÑ0-9]/g,'').replace(/Ñ/g,'N');}
function toast(message,good=false){let el=document.getElementById('toast');el.textContent=message;el.style.background=good?'#bde6cb':'#ead0ac';el.classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('visible'),3300);}
function playTone(kind='good'){
  if(!sound)return;
  try{
    soundContext??=new(window.AudioContext||window.webkitAudioContext)();
    const osc=soundContext.createOscillator();const gain=soundContext.createGain();osc.type=kind==='good'?'sine':'triangle';
    osc.frequency.setValueAtTime(kind==='good'?530:190,soundContext.currentTime);
    if(kind==='good')osc.frequency.exponentialRampToValueAtTime(780,soundContext.currentTime+.17);
    gain.gain.setValueAtTime(.07,soundContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,soundContext.currentTime+.23);
    osc.connect(gain);gain.connect(soundContext.destination);osc.start();osc.stop(soundContext.currentTime+.24);
  }catch(_e){}
}
document.getElementById('sound-toggle').addEventListener('click',event=>{sound=!sound;event.currentTarget.innerHTML=sound?'♫ <span>Sonido activado</span>':'♪ <span>Sonido apagado</span>';if(sound)playTone();});
function modeNote(){return isDemo?'<div class="notice">✦ Modo demostración: la app de Firebase ya tiene sus datos cargados, pero falta ingresar la URL de Realtime Database en <strong>firebase-config.js</strong> y habilitar su autenticación y reglas. <strong>Todavía no sincroniza teléfonos distintos.</strong></div>':'';}
function errText(error){const s=String(error?.message||error||'Error desconocido');if(s.includes('PERMISSION_DENIED')||s.includes('permission-denied'))return 'Firebase rechazó la conexión. Revisá las reglas de Realtime Database y la autenticación anónima.';if(s.includes('auth/operation-not-allowed'))return 'Tenés que activar el inicio de sesión Anónimo en Firebase Authentication.';return s;}
async function initialize(){
  try{
    if(isDemo){uid=sessionStorage.getItem('hechizo-uid');if(!uid){uid='demo-'+makeCode()+makeCode();sessionStorage.setItem('hechizo-uid',uid);}window.addEventListener('storage',e=>{if(roomCode && e.key===localKey(roomCode)){room=JSON.parse(e.newValue||'null');render();}});}
    else{
      const [{initializeApp},{getAuth,signInAnonymously,onAuthStateChanged},{getDatabase,ref,onValue,runTransaction}] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js')
      ]);
      const firebaseApp=initializeApp(firebaseConfig);const auth=getAuth(firebaseApp);
      db=getDatabase(firebaseApp);api={ref,onValue,runTransaction};
      await signInAnonymously(auth);uid=auth.currentUser?.uid;
      if(!uid){await new Promise(resolve=>{let stop=onAuthStateChanged(auth,user=>{if(user){uid=user.uid;stop();resolve();}});});}
    }
    const fromURL=new URL(location.href).searchParams.get('sala');
    if(fromURL&&/^[A-HJ-NP-Z2-9]{6}$/.test(fromURL.toUpperCase()))await openRoom(fromURL.toUpperCase());
    else render();
  }catch(error){app.innerHTML=`<section class="panel"><h1>No pudimos entrar a la mansión</h1><p class="notice error">${escapeHTML(errText(error))}</p><p class="muted small">Comprobá que Firebase esté configurado, con Authentication anónimo y Realtime Database habilitados.</p></section>`;}
}
function makeCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let out='';if(globalThis.crypto?.getRandomValues){const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);for(const b of bytes)out+=chars[b%chars.length];}else for(let i=0;i<6;i++)out+=chars[Math.floor(Math.random()*chars.length)];return out;}
function localKey(code){return 'hechizo-room-'+code;}
function initialRoom(){return {hostUid:uid,phase:'lobby',createdAt:Date.now(),startedAt:0,endedAt:0,endedBy:'',endReason:'',testMode:false,teams:Object.fromEntries(TEAM_IDS.map(id=>[id,{claimedBy:'',index:0,score:0,hints:0,mistakes:0,joined:false}]))};}
function setURL(code){const url=new URL(location.href);if(code)url.searchParams.set('sala',code);else url.searchParams.delete('sala');history.replaceState(null,'',url.pathname+url.search+url.hash);}
async function createRoom(){if(busy)return;busy=true;
  try{
    let code, committed=false;
    for(let i=0;i<5&&!committed;i++){
      code=makeCode();const seed=initialRoom();
      if(isDemo){if(!localStorage.getItem(localKey(code))){localStorage.setItem(localKey(code),JSON.stringify(seed));committed=true;}}
      else{const res=await api.runTransaction(api.ref(db,'rooms/'+code),current=>current===null?seed:undefined,{applyLocally:false});committed=res.committed;}
    }
    if(!committed)throw Error('No se pudo crear una sala nueva. Volvé a intentarlo.');
    await openRoom(code);toast('¡La mansión abrió sus puertas!',true);
  }catch(e){toast(errText(e));}finally{busy=false;}
}
async function openRoom(code){roomCode=code;lastScreen=null;setURL(code);
  if(unsub){unsub();unsub=null;}
  if(isDemo){room=JSON.parse(localStorage.getItem(localKey(code))||'null');render();}
  else{
    room=null;app.innerHTML='<section class="loading-card">Consultando la sala maldita…</section>';
    unsub=api.onValue(api.ref(db,'rooms/'+code),snap=>{room=snap.val();render();},error=>{app.innerHTML=`<section class="panel"><p class="notice error">${escapeHTML(errText(error))}</p></section>`;});
  }
}
async function changeRoom(transform){
  if(busy)return {committed:false};busy=true;
  try{
    if(isDemo){const original=JSON.parse(localStorage.getItem(localKey(roomCode))||'null');if(!original)return {committed:false};const next=transform(JSON.parse(JSON.stringify(original)));if(!next)return {committed:false};localStorage.setItem(localKey(roomCode),JSON.stringify(next));room=next;render();return {committed:true};}
    const res=await api.runTransaction(api.ref(db,'rooms/'+roomCode),current=>{
      if(!current)return;
      return transform(JSON.parse(JSON.stringify(current)));
    },{applyLocally:false});
    if(!res.committed)toast('No se pudo aplicar la acción. Puede que el juego ya haya terminado.');
    return res;
  }catch(e){toast(errText(e));return {committed:false};}
  finally{busy=false;}
}
function currentRole(){if(!room)return {role:'visitor'};if(room.hostUid===uid)return {role:'host'};const teamId=TEAM_IDS.find(id=>room.teams?.[id]?.claimedBy===uid);return teamId?{role:'team',teamId}:{role:'visitor'};}
function joinedCount(){return TEAM_IDS.filter(id=>room?.teams?.[id]?.joined).length;}
function scoreboardHTML(selected){return `<section class="scoreboard" aria-label="Marcador en vivo">${TEAM_IDS.map(id=>{const t=room.teams[id],team=TEAMS[id];return `<article class="score-card ${selected===id?'active':''}"><div class="score-head"><span><span class="icon">${team.icon}</span> ${team.name}</span></div><div class="score-num">${t.score||0} <span>segundos</span></div><div class="micro">${t.index||0}/10 resueltos · ${t.joined?'en juego':'sin conectar'}</div><div class="progress-line"><span style="width:${(t.index||0)*10}%"></span></div></article>`;}).join('')}</section>`;}
function updateBoard(selected){const target=document.getElementById('scoreboard-slot');if(target&&room)target.innerHTML=scoreboardHTML(selected);}
function roomToolbar(){return `<div class="room-header"><div><div class="tiny-label">CÓDIGO DE LA SALA</div><div class="room-code">${roomCode}</div></div><div class="row"><span class="pill"><span class="pulse"></span>${room.phase==='lobby'?'Esperando equipos':room.phase==='playing'?'Partida en vivo':'Juego finalizado'}</span><button class="btn secondary" id="copy-link">Copiar enlace</button></div></div>`;}
function baseBoard(selected){return `<div id="scoreboard-slot">${scoreboardHTML(selected)}</div>`;}
function homeHTML(){return `<div class="stack"><section class="hero"><div class="hero-copy"><span class="tiny-label">LA MANSIÓN ESTÁ ABIERTA</span><h1>¿Podrán romper <em>los diez hechizos?</em></h1><p>Cuatro equipos. Diez acertijos. Cada respuesta correcta les regala segundos para el Rosco Final. Pero cuidado: cuando un equipo termine, el tiempo se detiene para todos.</p><span class="hero-note">❖ LA PRIMERA RESPUESTA CORRECTA ABRE EL SIGUIENTE ENIGMA</span></div></section>${modeNote()}<section class="panel"><div class="tiny-label">PASO 1 · ABRIR O ENTRAR A UNA SALA</div><h2 class="scene-title" style="font-size:39px">Que comience la maldición</h2><p class="panel-intro">Una persona crea la sala y comparte el enlace. Cada equipo elige su nombre desde su propio teléfono.</p><div class="actions"><button class="btn primary" id="create">✦ Crear una sala</button></div><div class="divider"></div><form class="inline-form" id="join-form"><div class="field" style="margin:0"><label for="room-input">¿YA TENÉS UN CÓDIGO?</label><input class="input code" id="room-input" maxlength="6" autocapitalize="characters" placeholder="ABC234" required /></div><button class="btn secondary" type="submit">Entrar a la sala →</button></form></section></div>`;}
function notFoundHTML(){return `<section class="panel center"><span class="tiny-label">LA PUERTA NO SE ABRE</span><h1 class="scene-title">No existe esta sala</h1><p class="muted">Comprobá el código con quien organizó el juego.</p><button class="btn secondary" id="go-home">Volver al inicio</button></section>`;}
function chooseHTML(){return `<div class="stack">${modeNote()}<section class="panel">${roomToolbar()}<div class="divider"></div><span class="tiny-label">PASO 2 · ELEGÍ TU EQUIPO</span><h1 class="scene-title" style="font-size:clamp(40px,7vw,57px)">¿A qué criaturas pertenecés?</h1><p class="panel-intro">Elegí tu grupo. Cuando los cuatro equipos estén listos, Jack Mortis abrirá el primer hechizo.</p><div class="join-grid">${TEAM_IDS.map(id=>{const t=room.teams[id],team=TEAMS[id];const taken=t.joined;return `<button class="team-choice ${taken?'taken':''}" data-team="${id}" ${taken||room.phase!=='lobby'?'disabled':''}><span class="emoji">${team.icon}</span><strong>${team.name}</strong><small>${taken?'Ocupado':'Seleccionar'}</small></button>`;}).join('')}</div>${room.phase!=='lobby'?'<p class="notice">La partida ya comenzó. Pedile al anfitrión que reinicie el juego para entrar.</p>':''}</section>${baseBoard(null)}</div>`;}
function lobbyHTML(role,teamId){let host=role==='host';let joined=joinedCount();return `<div class="stack">${modeNote()}<section class="panel">${roomToolbar()}<div class="divider"></div><span class="tiny-label">${host?'PANEL DEL ANFITRIÓN':'EQUIPO CONFIRMADO'}</span><h1 class="scene-title" style="font-size:clamp(35px,6vw,57px)">${host?'Jack está esperando…':TEAMS[teamId].icon+' '+TEAMS[teamId].name}</h1><p class="panel-intro">${host?'Compartí el enlace con los cuatro equipos. Cada uno debe elegir su grupo en su celular.':'¡Ya forman parte de la mansión! El anfitrión empezará la partida cuando estén listos.'}</p><p class="heading-small">${joined} de 4 equipos conectados</p><div class="actions">${host?`<button class="btn primary" id="start-game" ${joined!==4?'disabled':''}>✦ Comenzar los 10 hechizos</button><button class="btn secondary" id="start-test" ${joined<1?'disabled':''}>🧪 Probar con ${joined===1?'1 equipo':joined+' equipos'}</button><button class="btn secondary" id="share-link">Compartir sala</button>`:`<button class="btn secondary" id="leave-team">Cambiar de equipo</button>`}</div>${host&&joined!==4?'<p class="micro muted">Para la partida oficial se necesitan los cuatro equipos. Para ensayar, podés comenzar con solo uno.</p>':''}</section>${baseBoard(teamId)}</div>`;}
function roomPlayingHost(){return `<div class="stack"><section class="panel">${roomToolbar()}<div class="divider"></div><span class="tiny-label">PANEL DE JACK MORTIS · PARTIDA EN CURSO</span><h1 class="scene-title">La carrera ha comenzado${room.testMode?' · Modo prueba':''}</h1><p class="panel-intro">Los equipos están resolviendo sus hechizos en sus celulares. El marcador cambia automáticamente a medida que suman segundos.</p><div class="actions"><button class="btn danger" id="end-game">Juego finalizado · detener a todos</button></div></section>${baseBoard(null)}</div>`;}
function roomPlayingTeam(teamId){
  const t=room.teams[teamId],i=t.index,p=PUZZLES[i];
  if(!p)return `<section class="panel"><h1>Hechizos completados</h1><p>El resto de la mansión está cerrando sus puertas…</p></section>`;
  const hint=t.hints||0;
  return `<div class="stack"><section class="panel" style="padding:19px 21px">${roomToolbar()}${baseBoard(teamId)}</section><div class="play-layout"><section class="panel riddle"><div class="riddle-index"><span class="riddle-count">HECHIZO ${String(i+1).padStart(2,'0')} / 10</span><span class="pill">${TEAMS[teamId].icon} ${TEAMS[teamId].name}</span></div><div class="progress-steps">${PUZZLES.map((_,j)=>`<b class="${j<i?'done':j===i?'current':''}"></b>`).join('')}</div><h2>«${escapeHTML(p.q)}»</h2><div class="letter-boxes" aria-label="${p.a.length} letras">${[...p.a].map(()=>'<i></i>').join('')}</div><form class="answer-form" id="answer-form"><div class="field"><label class="center" for="answer">ESCRIBAN LA PALABRA CORRECTA</label><input class="input answer" id="answer" type="text" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="40" placeholder="SU RESPUESTA" required /></div><div class="actions"><button class="btn primary block" type="submit">Comprobar hechizo →</button></div></form></section><aside class="side-stack"><section class="panel"><div class="tiny-label">PREMIO ACTUAL</div><div class="s-point">+${POINTS[hint]} segundos</div><p class="muted small">Los ganan cuando respondan bien.</p><div class="divider"></div><div class="tiny-label">AYUDAS DE JACK</div><p class="small muted">Cada pista cuesta segundos, pero te acerca a la respuesta.</p><div class="actions"><button class="btn secondary block" id="take-hint" ${hint>=2?'disabled':''}>${hint===0?'Revelar primera pista':hint===1?'Revelar segunda pista':'Sin pistas disponibles'}</button></div></section>${hint>=1?`<section class="hint-card"><h3>✦ Pista 1</h3><p>${escapeHTML(p.h1)}</p></section>`:''}${hint>=2?`<section class="hint-card"><h3>✦ Pista 2</h3><p>${escapeHTML(p.h2)}</p></section>`:''}<button class="btn danger block" id="end-game">Juego finalizado</button><p class="micro muted center">Este botón termina el juego para <strong>los cuatro equipos</strong>. Pedirá confirmación.</p></aside></div></div>`;
}
function finishedHTML(){
  const ranking=TEAM_IDS.slice().sort((a,b)=>room.teams[b].score-room.teams[a].score||room.teams[b].index-room.teams[a].index);
  const endText=room.endReason==='completed'?`¡${TEAMS[room.endedBy]?.name||'Un equipo'} resolvió los diez hechizos!`:'El juego fue detenido para todos los equipos.';
  return `<div class="stack"><section class="panel"><div class="tiny-label center">JACK MORTIS PRESENTA · ${room.testMode?'RESULTADOS DE PRUEBA':'EL VEREDICTO FINAL'}</div><h1 class="final-intro center">¡Juego finalizado!</h1><p class="panel-intro center" style="margin:0 auto 14px">${endText} Desde ese instante ninguna respuesta suma segundos.</p>${baseBoard(null)}<div class="divider"></div><div class="heading-small center">Segundos acumulados para el Rosco Final</div><div class="ranking">${ranking.map((id,pos)=>{const t=room.teams[id];return `<div class="ranking-row"><span class="rank-badge">${pos+1}</span><span>${TEAMS[id].icon} <strong>${TEAMS[id].name}</strong><div class="micro muted">${t.index}/10 acertijos resueltos</div></span><div class="result-score">${t.score} <small>seg</small></div></div>`;}).join('')}</div><p class="muted small center">El orden es por segundos acumulados; la victoria definitiva se decide en el Rosco Final.</p><details class="accordion"><summary>Ver las soluciones de los 10 hechizos</summary>${PUZZLES.map((p,i)=>`<div class="solution"><strong>${i+1}. ${p.a}</strong><p>${escapeHTML(p.explain)}</p></div>`).join('')}</details>${room.hostUid===uid?'<div class="actions"><button class="btn primary" id="reset-game">Preparar otra partida</button></div>':''}</section></div>`;
}
function render(){
  if(!uid)return;
  if(roomCode&&!room){const key='404';if(key!==lastScreen){app.innerHTML=notFoundHTML();lastScreen=key;bind();}return;}
  const role=currentRole();const own=role.role==='team'?room?.teams?.[role.teamId]:null;
  const signature=roomCode?`${roomCode}/${room.phase}/${role.role}/${role.teamId||''}/${own?.index||0}/${own?.hints||0}/${room.phase==='lobby'?joinedCount():''}`:'home';
  if(signature!==lastScreen){
    lastScreen=signature;
    if(!roomCode)app.innerHTML=homeHTML();
    else if(room.phase==='finished')app.innerHTML=finishedHTML();
    else if(room.phase==='lobby')app.innerHTML=role.role==='visitor'?chooseHTML():lobbyHTML(role.role,role.teamId);
    else if(room.phase==='playing')app.innerHTML=role.role==='host'?roomPlayingHost():role.role==='team'?roomPlayingTeam(role.teamId):chooseHTML();
    bind();
  }
  updateBoard(role.teamId);
}
function bind(){
  const $=id=>document.getElementById(id);
  $('create')?.addEventListener('click',createRoom);
  $('join-form')?.addEventListener('submit',async ev=>{ev.preventDefault();const code=$('room-input').value.trim().toUpperCase();if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))return toast('Ingresá un código válido de seis caracteres.');await openRoom(code);});
  $('go-home')?.addEventListener('click',()=>{room=null;roomCode=null;lastScreen=null;setURL(null);render();});
  app.querySelectorAll('[data-team]').forEach(btn=>btn.addEventListener('click',async()=>{
    const id=btn.dataset.team;
    const outcome=await changeRoom(r=>{if(r.phase!=='lobby'||r.teams[id].joined)return;const other=TEAM_IDS.some(k=>r.teams[k].claimedBy===uid);if(other)return;r.teams[id].claimedBy=uid;r.teams[id].joined=true;return r;});
    if(outcome.committed)toast('¡Equipo confirmado!',true);
  }));
  $('start-game')?.addEventListener('click',async()=>{
    const outcome=await changeRoom(r=>{if(r.hostUid!==uid||r.phase!=='lobby'||!TEAM_IDS.every(id=>r.teams[id].joined))return;r.phase='playing';r.testMode=false;r.startedAt=Date.now();return r;});
    if(outcome.committed)toast('¡Que comiencen los juegos!',true);
  });
  $('start-test')?.addEventListener('click',async()=>{
    if(!window.confirm('¿Comenzar una PARTIDA DE PRUEBA con los equipos conectados? Esta sala pasará a modo juego.'))return;
    const outcome=await changeRoom(r=>{
      if(r.hostUid!==uid||r.phase!=='lobby'||!TEAM_IDS.some(id=>r.teams[id].joined))return;
      r.phase='playing';r.testMode=true;r.startedAt=Date.now();return r;
    });
    if(outcome.committed)toast('¡Modo prueba iniciado!',true);
  });
  $('leave-team')?.addEventListener('click',async()=>changeRoom(r=>{if(r.phase!=='lobby')return;const id=TEAM_IDS.find(k=>r.teams[k].claimedBy===uid);if(!id)return;r.teams[id].claimedBy='';r.teams[id].joined=false;return r;}));
  $('answer-form')?.addEventListener('submit',async ev=>{
    ev.preventDefault();const form=$('answer-form');const input=$('answer');const answer=normalize(input.value);
    if(!answer){toast('Escriban su respuesta.');return;}
    const role=currentRole();const id=role.teamId;if(!id||!room||room.phase!=='playing')return;
    const expectedIndex=room.teams[id].index;
    if(answer!==normalize(PUZZLES[expectedIndex]?.a)){
      const outcome=await changeRoom(r=>{if(r.phase!=='playing'||r.teams[id].index!==expectedIndex)return;r.teams[id].mistakes=(r.teams[id].mistakes||0)+1;return r;});
      if(outcome.committed){toast('Ese no es el hechizo. Intenten otra vez.');playTone('bad');input.focus();input.select();}return;
    }
    const earned=POINTS[room.teams[id].hints||0];
    const outcome=await changeRoom(r=>{
      if(r.phase!=='playing'||r.teams[id].index!==expectedIndex||r.teams[id].claimedBy!==uid)return;
      const team=r.teams[id];team.score+=POINTS[team.hints||0];team.index++;team.hints=0;
      if(team.index===PUZZLES.length){r.phase='finished';r.endReason='completed';r.endedBy=id;r.endedAt=Date.now();}
      return r;
    });
    if(outcome.committed){toast(`¡Correcto! +${earned} segundos`,true);playTone('good');}
  });
  $('take-hint')?.addEventListener('click',async()=>{
    const {role,teamId}=currentRole();if(role!=='team')return;
    const expectedIndex=room.teams[teamId].index;
    const outcome=await changeRoom(r=>{if(r.phase!=='playing'||r.teams[teamId].index!==expectedIndex||r.teams[teamId].hints>=2)return;r.teams[teamId].hints++;return r;});
    if(outcome.committed)toast('Jack te ha concedido una pista.');
  });
  $('end-game')?.addEventListener('click',async()=>{
    if(!window.confirm('¿Terminar el juego para TODOS los equipos? Nadie podrá seguir sumando segundos y la decisión no se puede deshacer.'))return;
    await changeRoom(r=>{if(r.phase!=='playing')return;r.phase='finished';r.endedAt=Date.now();r.endedBy=currentRole().teamId||'host';r.endReason='manual';return r;});
  });
  $('reset-game')?.addEventListener('click',async()=>{
    if(!window.confirm('¿Reiniciar para una nueva partida? Se borrarán los segundos y todos deberán volver a elegir equipo.'))return;
    await changeRoom(r=>{if(r.hostUid!==uid||r.phase!=='finished')return;r.phase='lobby';r.testMode=false;r.startedAt=0;r.endedAt=0;r.endedBy='';r.endReason='';for(const id of TEAM_IDS){r.teams[id].score=0;r.teams[id].index=0;r.teams[id].hints=0;r.teams[id].mistakes=0;r.teams[id].claimedBy='';r.teams[id].joined=false;}return r;});
  });
  $('copy-link')?.addEventListener('click',copyLink);
  $('share-link')?.addEventListener('click',shareLink);
}
function getShareURL(){return `${location.origin}${location.pathname}?sala=${roomCode}`;}
async function copyLink(){try{await navigator.clipboard.writeText(getShareURL());toast('Enlace copiado. Compartilo por WhatsApp.',true);}catch{window.prompt('Copiá este enlace:',getShareURL());}}
async function shareLink(){if(navigator.share){try{await navigator.share({title:'El Hechizo Indescifrable',text:'Entrá a la mansión de Jack Mortis y elegí tu equipo.',url:getShareURL()});}catch{}}else await copyLink();}

initialize();
