(() => {
  const STORAGE_KEY='oxford3000-layer-progress-v17';
  const OLD_KEYS=['oxford3000-layer-progress-v16','oxford3000-layer-progress-v15','oxford3000-layer-progress-v14','oxford3000-layer-progress-v13','oxford3000-layer-progress-v12','oxford3000-layer-progress-v11','oxford3000-layer-progress-v10','oxford3000-layer-progress-v9','oxford3000-layer-progress-v8','oxford3000-layer-progress-v7','oxford3000-layer-progress-v6','oxford3000-layer-progress-v5','oxford3000-layer-progress-v4','oxford3000-layer-progress-v3','oxford3000-layer-progress-v2','oxford3000-layer-progress-v1'];
  const WORDS_URL='./words.json', LEVELS_URL='./word_levels.json', FORMS_URL='./word_forms.json', EXAMPLES_URL='https://raw.githubusercontent.com/winterdl/oxford-5000-vocabulary-audio-definition/main/data/oxford_3000.json', DICTIONARY_EXAMPLE_URL='https://api.dictionaryapi.dev/api/v2/entries/en/', EXAMPLE_TRANSLATE_URL='https://api.mymemory.translated.net/get', TOTAL_LAYERS_MAX=10, TOTAL_WORDS_EXPECTED=3000;
  const EXAMPLE_CACHE_KEY='oxford3000-example-fa-v3';
  const DICTIONARY_EXAMPLE_CACHE_KEY='oxford3000-example-en-v1';
  const PREFERRED_EXAMPLES={point:{en:'The point of this lesson is to help you learn new words.',fa:'هدف این درس این است که به شما کمک کند کلمات جدید یاد بگیرید.'}};
  const state={layers:Array.from({length:TOTAL_LAYERS_MAX},()=>new Set()),mastered:new Set(),history:{},favorites:new Set(),current:null,revealed:false,words:{},levels:{},forms:{},progressUnits:0,streak:0,bestStreak:0,activeLayerCount:5,enabledLevels:new Set(['A1','A2','B1','B2']),favoritesOnly:false,theme:'dark',font:'Noto Sans Arabic',showExamples:true,showForms:false,wrongMovesBack:true,locked:false,timerSeconds:0,timerEnd:0,timerRunning:false,timerCompletionShown:false};
  let timerTick=null,voices=[],exampleEntries=[],exampleMap=new Map(),exampleReady=false,exampleTranslationCache={},dictionaryExampleCache={};
  const $=id=>document.getElementById(id), content=$('content');
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  function normalizeWordKey(word){return String(word||'').trim().toLowerCase()}
  function escapeHtml(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
  function splitMeanings(value){if(Array.isArray(value))return value.flatMap(splitMeanings).map(v=>String(v).trim()).filter(Boolean);if(typeof value!=='string')return [];return value.split(/\s*؛\s*|\s*;\s*/).map(v=>v.trim()).filter(Boolean)}
  function cleanExampleKey(value){let w=String(value||'').trim().toLowerCase();w=w.replace(/\d+(?=\s|$)/g,'');w=w.replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim();if(w==='a, an')w='a';return w}
  function decodeEntities(text){const el=document.createElement('textarea');el.innerHTML=String(text||'');return el.value}
  function isLikelyGenericExample(text,word){
    const t=String(text||'').toLowerCase().replace(/\s+/g,' ').trim();
    const w=normalizeWordKey(word);
    if(!t)return true;
    if(/\b(?:i(?:'m| am)?\s+(?:learning|learned|learnt|learn)\s+(?:the\s+)?word|this\s+(?:word|sentence|example)\s+(?:means|is|shows)|the\s+word\s+['“”"']?[^'“”"']+['“”"']?\s+(?:means|is))\b/i.test(t))return true;
    if(/\b(?:today|right now)\b/i.test(t)&&/\b(?:learning|learnt|learned|learn)\b/i.test(t))return true;
    return false;
  }
  function cleanExampleText(value,word=''){
    let t=String(value||'').replace(/\s+/g,' ').trim();
    if(!t)return '';
    const parts=t.split(/,\s+/);
    const candidates=[...parts.slice(1).map(x=>({text:x,strictStart:true})),{text:t,strictStart:false}];
    for(const candidate of candidates){
      const x=candidate.text.replace(/^[-–—]\s*/,'').trim();
      const words=x.split(/\s+/).length;
      const startsCorrectly=(candidate.strictStart?/^[‘'“"A-Z]/:/^[‘'“"A-Za-z]/).test(x);
      if(startsCorrectly&&words>=5&&/[.!?]$/.test(x)&&!isLikelyGenericExample(x,word))return x;
    }
    return '';
  }
  function preferredExample(word){return PREFERRED_EXAMPLES[normalizeWordKey(word)]||null}
  function levelRank(level){return ({a1:1,a2:2,b1:3,b2:4})[String(level||'').toLowerCase()]||99}
  function fallbackExample(word){return {en:'',fa:'مثال مناسبی برای این کلمه در دسترس نیست.'}}
  function pickExample(word){
    const preferred=preferredExample(word);
    if(preferred)return preferred.en;
    const arr=exampleMap.get(cleanExampleKey(word))||[];
    if(!arr.length)return '';
    const targetLevels=(state.levels[normalizeWordKey(word)]||[]).map(x=>String(x).toLowerCase());
    const targetLevel=targetLevels.slice().sort((a,b)=>levelRank(a)-levelRank(b))[0]||'';
    const scored=arr.map(e=>{
      const text=cleanExampleText(e.example||'',word);
      if(!text)return null;
      let score=0;
      const entryLevel=String(e.cefr||'').toLowerCase();
      if(targetLevels.includes(entryLevel))score+=90;
      if(entryLevel===targetLevel)score+=40;
      if(text.split(/\s+/).length>=7)score+=16;
      if(/\b(?:I|You|He|She|They|We|It|This|That|The|A|An)\b/.test(text))score+=8;
      return {text,score};
    }).filter(Boolean);
    scored.sort((a,b)=>b.score-a.score||a.text.length-b.text.length);
    return scored[0]?.text||'';
  }
  function loadExampleCache(){try{exampleTranslationCache=JSON.parse(localStorage.getItem(EXAMPLE_CACHE_KEY)||'{}')||{}}catch{exampleTranslationCache={}}}
  function saveExampleCache(){try{localStorage.setItem(EXAMPLE_CACHE_KEY,JSON.stringify(exampleTranslationCache))}catch{}}
  function loadDictionaryExampleCache(){try{dictionaryExampleCache=JSON.parse(localStorage.getItem(DICTIONARY_EXAMPLE_CACHE_KEY)||'{}')||{}}catch{dictionaryExampleCache={}}}
  function saveDictionaryExampleCache(){try{localStorage.setItem(DICTIONARY_EXAMPLE_CACHE_KEY,JSON.stringify(dictionaryExampleCache))}catch{}}
  async function fetchDictionaryExample(word){
    const key=normalizeWordKey(word);
    if(!key)return '';
    const cached=dictionaryExampleCache[key];
    if(cached&&cleanExampleText(cached,key))return cached;
    try{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),6000);
      const r=await fetch(DICTIONARY_EXAMPLE_URL+encodeURIComponent(key),{cache:'force-cache',signal:controller.signal});
      clearTimeout(timeout);
      if(!r.ok)throw new Error('dictionary example unavailable');
      const data=await r.json();
      const candidates=[];
      for(const entry of Array.isArray(data)?data:[]){
        for(const meaning of Array.isArray(entry?.meanings)?entry.meanings:[]){
          for(const def of Array.isArray(meaning?.definitions)?meaning.definitions:[]){
            const text=cleanExampleText(def?.example||'',key);
            if(text)candidates.push(text);
          }
        }
      }
      candidates.sort((a,b)=>{
        const aw=a.split(/\s+/).length,bw=b.split(/\s+/).length;
        const as=aw>=7&&aw<=20?10:0,bs=bw>=7&&bw<=20?10:0;
        return bs+b.length*.002-(as+a.length*.002);
      });
      const best=candidates[0]||'';
      if(best){dictionaryExampleCache[key]=best;saveDictionaryExampleCache()}
      return best;
    }catch{return ''}
  }
  async function loadExamples(){
    try{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),8000);
      const r=await fetch(EXAMPLES_URL,{cache:'force-cache',mode:'cors',signal:controller.signal});
      clearTimeout(timeout);
      if(!r.ok)throw new Error('examples unavailable');
      const data=await r.json();
      exampleEntries=Object.values(data||{}).filter(x=>x&&x.word&&x.example).map((e,i)=>({...e,__sourceIndex:i}));
      exampleMap=new Map();
      for(const e of exampleEntries){const k=cleanExampleKey(e.word);if(!exampleMap.has(k))exampleMap.set(k,[]);exampleMap.get(k).push(e)}
      exampleReady=true;
      if(state.current&&state.revealed)renderCard(state.current,{preserve:true});
    }catch{
      exampleReady=false;
      if(state.current&&state.revealed)prepareSupplementary();
    }
  }
  function usablePersianTranslation(source,translation){
    const s=String(source||'').trim(),t=String(translation||'').replace(/\s+/g,' ').trim();
    if(!s||!t||t===s)return false;
    if(!/[\u0600-\u06FF]/.test(t))return false;
    if(t.length<5||t.length>700)return false;
    if(/(?:translation|translated|error|undefined|null|failed|quota)/i.test(t))return false;
    const sourceWords=s.split(/\s+/).length,translatedWords=t.split(/\s+/).length;
    const minWords=Math.max(3,Math.ceil(sourceWords*.38));
    if(sourceWords>=4&&translatedWords<minWords)return false;
    const englishWords=(t.match(/[A-Za-z]{2,}/g)||[]).length;
    if(englishWords>=Math.max(2,Math.ceil(translatedWords*.35)))return false;
    if(/[.!?]$/.test(s)&&translatedWords<3)return false;
    return true;
  }
  async function translateWithMyMemory(text){
    try{
      const url=EXAMPLE_TRANSLATE_URL+'?q='+encodeURIComponent(text)+'&langpair=en|fa&mt=1';
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok)throw new Error('translate failed');
      const data=await r.json();
      const candidates=[];
      const push=(value,quality,match)=>{const t=decodeEntities(value||'').replace(/\s+/g,' ').trim();if(!usablePersianTranslation(text,t))return;candidates.push({text:t,score:Math.min(1,Math.max(0,(Number(match)||0)*.7+(Number(quality)||0)*.003))})};
      push(data?.responseData?.translatedText,data?.responseData?.quality,data?.responseData?.match);
      for(const m of Array.isArray(data?.matches)?data.matches:[])push(m?.translation,m?.quality,m?.match);
      candidates.sort((a,b)=>b.score-a.score||b.text.length-a.text.length);
      return candidates[0]||null;
    }catch{return null}
  }
  async function translateWithGoogle(text){
    try{
      const url='https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&q='+encodeURIComponent(text);
      const r=await fetch(url,{cache:'no-store'});
      if(!r.ok)throw new Error('fallback translate failed');
      const data=await r.json();
      const translated=Array.isArray(data?.[0])?data[0].map(x=>x?.[0]||'').join('').replace(/\s+/g,' ').trim():'';
      return usablePersianTranslation(text,translated)?{text:translated,score:.78}:null;
    }catch{return null}
  }
  async function translateExample(text,word){
    const key=String(text||'').trim();
    if(!key)return '';
    const cached=exampleTranslationCache[key];
    if(usablePersianTranslation(key,cached))return cached;
    const [google,myMemory]=await Promise.all([translateWithGoogle(key),translateWithMyMemory(key)]);
    const best=[google,myMemory].filter(Boolean).sort((a,b)=>b.score-a.score||b.text.length-a.text.length)[0];
    if(best){exampleTranslationCache[key]=best.text;saveExampleCache();return best.text}
    delete exampleTranslationCache[key];saveExampleCache();
    return '';
  }
  function getTotalWords(){return Object.keys(state.words).length}
  function enabled(word){const lv=state.levels[word]||[];return lv.length?lv.some(x=>state.enabledLevels.has(x)):true}
  function layerForWord(word){if(state.mastered.has(word))return TOTAL_LAYERS_MAX+1;for(let i=0;i<TOTAL_LAYERS_MAX;i++)if(state.layers[i].has(word))return i+1;return 1}
  function isHiddenByLayer(word){const l=layerForWord(word);return l>TOTAL_LAYERS_MAX||l>state.activeLayerCount}
  function learnedCount(){let n=state.mastered.size;for(let i=state.activeLayerCount;i<TOTAL_LAYERS_MAX;i++)n+=state.layers[i].size;return n}
  function progressPercent(){const total=getTotalWords();if(!total)return 0;return clamp((Math.max(0,state.progressUnits)/(TOTAL_WORDS_EXPECTED*state.activeLayerCount))*100,0,100)}
  function stepUnit(){return 1}
  function chooseWeightedLayer(){
    if(state.favoritesOnly)return -1;
    const counts=[];for(let i=0;i<state.activeLayerCount;i++){let count=0;for(const w of state.layers[i])if(enabled(w))count++;counts.push(count)}
    const total=counts.reduce((a,b)=>a+b,0);if(!total)return -1;let r=Math.random()*total;for(let i=0;i<counts.length;i++){r-=counts[i];if(r<0)return i}return counts.length-1;
  }
  function eligibleWords(){
    if(state.favoritesOnly){return [...state.favorites].filter(w=>Object.prototype.hasOwnProperty.call(state.words,w))}
    const arr=[];for(let i=0;i<state.activeLayerCount;i++)for(const w of state.layers[i])if(enabled(w))arr.push(w);return arr;
  }
  function chooseWord(){
    if(state.favoritesOnly){const arr=eligibleWords();if(!arr.length)return null;const current=state.current?.word;let pool=arr.filter(w=>w!==current);if(!pool.length)pool=arr;const word=pool[Math.floor(Math.random()*pool.length)];return {word,layerIndex:Math.max(0,layerForWord(word)-1),favoritePractice:true}}
    const li=chooseWeightedLayer();if(li<0)return null;const arr=[...state.layers[li]].filter(enabled);if(!arr.length)return null;return {word:arr[Math.floor(Math.random()*arr.length)],layerIndex:li,favoritePractice:false}
  }
  function moveWord(word,from,to){state.layers[from]?.delete(word);if(to>=0&&to<TOTAL_LAYERS_MAX)state.layers[to].add(word)}
  function cleanDisplayWord(raw){return String(raw).replace(/\d+(?=\s|$)/g,'').replace(/\s*\([^)]*\)\s*/g,'').replace(/\s+/g,' ').trim()}
  function levelsText(word){return (state.levels[word]||[]).map(escapeHtml).join(' · ')||'—'}
  function formatPct(){return progressPercent().toLocaleString('fa-IR',{maximumFractionDigits:2})+'٪'}

  function loadSaved(){for(const key of [STORAGE_KEY,...OLD_KEYS]){try{const raw=localStorage.getItem(key);if(raw){const p=JSON.parse(raw);if(p&&typeof p==='object')return p}}catch{}}return {}}
  function save(){
    const placements={};state.layers.forEach((set,i)=>set.forEach(w=>placements[w]=i+1));
    localStorage.setItem(STORAGE_KEY,JSON.stringify({version:17,activeLayerCount:state.activeLayerCount,placements,mastered:[...state.mastered],history:state.history,favorites:[...state.favorites],scoreUnits:Math.max(0,Math.floor(state.progressUnits||0)),streak:Math.max(0,Math.floor(state.streak||0)),bestStreak:Math.max(0,Math.floor(state.bestStreak||0)),enabledLevels:[...state.enabledLevels],favoritesOnly:!!state.favoritesOnly,theme:state.theme,font:state.font,showExamples:!!state.showExamples,showForms:!!state.showForms,wrongMovesBack:!!state.wrongMovesBack,timerEnd:state.timerEnd,timerSeconds:state.timerSeconds,timerRunning:state.timerRunning,updatedAt:new Date().toISOString()}));
  }
  function ensureHistory(){for(const w of Object.keys(state.words)){const h=state.history[w];state.history[w]={correct:Math.max(0,Math.floor(Number(h?.correct)||0)),wrong:Math.max(0,Math.floor(Number(h?.wrong)||0))}}}
  function initState(){
    const saved=loadSaved();state.layers=Array.from({length:TOTAL_LAYERS_MAX},()=>new Set());
    state.mastered=new Set(Array.isArray(saved.mastered)?saved.mastered.filter(w=>w in state.words):[]);
    const placements=saved.placements&&typeof saved.placements==='object'?saved.placements:{};const has=Object.keys(placements).length>0||saved.version>=9;
    for(const w of Object.keys(state.words)){
      if(state.mastered.has(w))continue;
      const l=has&&Object.prototype.hasOwnProperty.call(placements,w)?clamp(Math.floor(Number(placements[w])||1),1,TOTAL_LAYERS_MAX):1;
      state.layers[l-1].add(w);
    }
    state.progressUnits=Math.max(0,Math.floor(Number(saved.scoreUnits)||0));state.streak=Math.max(0,Math.floor(Number(saved.streak)||0));state.bestStreak=Math.max(state.streak,Math.floor(Number(saved.bestStreak)||0));
    state.activeLayerCount=clamp(Math.floor(Number(saved.activeLayerCount)||5),1,TOTAL_LAYERS_MAX);state.history=(saved.history&&typeof saved.history==='object')?saved.history:{};state.favorites=new Set(Array.isArray(saved.favorites)?saved.favorites.filter(w=>w in state.words):[]);
    state.enabledLevels=new Set(Array.isArray(saved.enabledLevels)?saved.enabledLevels.filter(x=>['A1','A2','B1','B2'].includes(x)):['A1','A2','B1','B2']);if(!state.enabledLevels.size)state.enabledLevels=new Set(['A1','A2','B1','B2']);
    state.favoritesOnly=!!saved.favoritesOnly;state.showExamples=saved.showExamples!==false;state.showForms=saved.showForms===true;state.wrongMovesBack=saved.wrongMovesBack!==false;state.theme=saved.theme==='light'?'light':'dark';state.font='Noto Sans Arabic';state.timerEnd=Math.max(0,Number(saved.timerEnd)||0);state.timerSeconds=Math.max(0,Number(saved.timerSeconds)||0);state.timerRunning=!!saved.timerRunning;ensureHistory();loadExampleCache();loadDictionaryExampleCache();applyTheme();applyFont();$('customMinutes').value=state.timerSeconds>0?Math.floor(state.timerSeconds/60):'';syncTimerState();
  }

  function applyTheme(){document.documentElement.dataset.theme=state.theme;document.documentElement.style.colorScheme=state.theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.theme==='light'?'#f3f6fb':'#07090d');const btn=$('themeToggle');if(btn){btn.textContent=state.theme==='dark'?'☀️':'🌙';btn.setAttribute('aria-label',state.theme==='dark'?'فعال‌کردن حالت لایت':'فعال‌کردن حالت دارک');btn.title=state.theme==='dark'?'حالت لایت':'حالت دارک'}}
  function applyFont(){document.documentElement.style.setProperty('--font-fa','"Noto Sans Arabic",Tahoma,"Segoe UI",Arial,sans-serif')}
  function learnedForCurrent(){return state.current?isHiddenByLayer(state.current.word):false}
  function applyFire(id,value){const el=$(id);if(!el)return;el.classList.remove('fire-1','fire-2','fire-3','fire-4','fire-5','fire-active');['--streak-opacity','--streak-glow','--streak-outer','--streak-border','--streak-outer-color','--streak-pulse','--streak-pulse-scale'].forEach(name=>el.style.removeProperty(name));const n=Math.max(0,Math.floor(Number(value)||0));const tier=Math.floor(n/5);if(!tier)return;const level=Math.min(tier,20);const opacity=(0.22+level*0.035).toFixed(3);const borderAlpha=Math.min(0.28+level*0.025,0.78).toFixed(3);const outerAlpha=Math.min(0.18+level*0.03,0.64).toFixed(3);el.classList.add('fire-active');el.style.setProperty('--streak-opacity',opacity);el.style.setProperty('--streak-glow',`${Math.round(8+level*2.2)}px`);el.style.setProperty('--streak-outer',`${Math.round(16+level*3.8)}px`);el.style.setProperty('--streak-border',`rgba(130,163,255,${borderAlpha})`);el.style.setProperty('--streak-outer-color',`rgba(173,130,255,${outerAlpha})`);el.style.setProperty('--streak-pulse',`${Math.max(0.72,1.8-level*0.055).toFixed(2)}s`);el.style.setProperty('--streak-pulse-scale',String(1+Math.min(level,20)*0.0015))}
  function updateMainStrip(){
    const layer=$('currentLayerStat'),streak=$('currentStreakStat'),best=$('currentBestStat'),learned=$('learnedStat'),hist=$('historyStat');
    const lv=state.current?(state.levels[state.current.word]||[]).join(' · '):'';
    if(layer)layer.textContent=state.current?(state.current.favoritePractice?`مرور نشان‌شده${lv?' · '+lv:''}`:`لایه ${state.current.layerIndex+1}${lv?' · '+lv:''}`):'—';
    if(streak)streak.textContent=state.streak.toLocaleString('fa-IR');if(best)best.textContent=state.bestStreak.toLocaleString('fa-IR');applyFire('currentStreakChip',state.streak);if(learned)learned.textContent=learnedCount().toLocaleString('fa-IR');
    if(hist){const h=state.current?(state.history[state.current.word]||{correct:0,wrong:0}):{correct:0,wrong:0};hist.textContent=`بلد بودم ${h.correct.toLocaleString('fa-IR')} · بلد نبودم ${h.wrong.toLocaleString('fa-IR')}` }
  }
  function updateDistribution(){
    $('layerRange').value=state.activeLayerCount;$('layerRangeValue').textContent=state.activeLayerCount.toLocaleString('fa-IR');
    $('layerList').style.setProperty('--layer-count',String(state.activeLayerCount));$('layerList').innerHTML=Array.from({length:state.activeLayerCount},(_,i)=>{let count=0;for(const w of state.layers[i])if(enabled(w))count++;return `<div class="layer-row ${state.current&&!state.current.favoritePractice&&i===state.current.layerIndex?'active':''}"><span class="layer-name">لایه ${i+1}</span><span class="layer-count">${count.toLocaleString('fa-IR')}</span></div>`}).join('');
    document.querySelectorAll('.level-filter').forEach(btn=>btn.classList.toggle('active',state.enabledLevels.has(btn.dataset.level)));
    $('favoriteMode').classList.toggle('active',state.favoritesOnly);$('favoriteMode').innerHTML=state.favoritesOnly?'★ فقط کلمات نشان‌شده':'☆ فقط کلمات نشان‌شده';
  }
  function updateToolToggles(){const a=$('exampleToggle'),b=$('formsToggle'),c=$('wrongMovesBackToggle');if(a){a.classList.toggle('active',state.showExamples);a.textContent=(state.showExamples?'✓ ':'')+'نمایش مثال'}if(b){b.classList.toggle('active',state.showForms);b.textContent=(state.showForms?'✓ ':'')+'نمایش شکل کلمه'}if(c){c.classList.toggle('active',state.wrongMovesBack);c.textContent=(state.wrongMovesBack?'✓ ':'')+'با اشتباه یک لایه برگرد'}}
  function updateAllStats(){const pct=formatPct();if($('progressPercent'))$('progressPercent').textContent=pct;updateMainStrip();updateDistribution();updateToolToggles()}

  function refreshVoices(){if('speechSynthesis' in window)voices=window.speechSynthesis.getVoices()||[]} if('speechSynthesis' in window){refreshVoices();window.speechSynthesis.addEventListener?.('voiceschanged',refreshVoices)}
  function pickBestEnglishVoice(){const english=voices.filter(v=>/^en[-_]/i.test(v.lang));if(!english.length)return null;const premium=/(natural|neural|enhanced|premium|online)/i,preferred=/(jenny|aria|samantha|ava|karen|zira|victoria|moira|susan|allison|female|google us english)/i,bad=/(compact|espeak|festival|robot|novelty)/i;const score=v=>(/^en-US/i.test(v.lang)?35:15)+(preferred.test(v.name)?38:0)+(premium.test(v.name)?36:0)+(/google/i.test(v.name)?22:0)+(/microsoft/i.test(v.name)?20:0)-(bad.test(v.name)?45:0);return english.slice().sort((a,b)=>score(b)-score(a))[0]||english[0]}
  function speakWord(){if(!state.current||!('speechSynthesis' in window)){showToast('مرورگر شما از تلفظ صوتی پشتیبانی نمی‌کند.');return}refreshVoices();window.speechSynthesis.cancel();const v=pickBestEnglishVoice(),u=new SpeechSynthesisUtterance(cleanDisplayWord(state.current.word));u.lang=v?.lang||'en-US';if(v)u.voice=v;u.rate=.82;u.pitch=1.04;u.volume=1;window.speechSynthesis.speak(u)}
  function speakExample(){const text=$('exampleEn')?.textContent?.trim()||pickExample(state.current?.word||'');if(!text||!('speechSynthesis' in window)){showToast('جملهٔ مثال در دسترس نیست.');return}refreshVoices();window.speechSynthesis.cancel();const v=pickBestEnglishVoice(),u=new SpeechSynthesisUtterance(text);u.lang=v?.lang||'en-US';if(v)u.voice=v;u.rate=.88;u.pitch=1.02;u.volume=1;window.speechSynthesis.speak(u)}
  function buildSupplementary(word){
    const form=state.forms[word]||null;
    const fixed=preferredExample(word);
    const ex=fixed?.en||(exampleReady?pickExample(word):'');
    const cachedFa=exampleTranslationCache[ex];
    const localFa=fixed?.fa||(usablePersianTranslation(ex,cachedFa)?cachedFa:(ex?'در حال آماده‌سازی ترجمه…':'در حال پیدا کردن مثال…'));
    let html='';
    if(state.showForms&&form){
      html+='<div class="supplement-card word-forms-panel"><div class="supp-title">شکل‌های کلمه</div>';
      if(form.singular&&form.plural)html+='<div class="form-row"><span>مفرد</span><strong>'+escapeHtml(form.singular)+'</strong><span>جمع</span><strong>'+escapeHtml(form.plural)+'</strong></div>';
      if(form.verb)html+='<div class="verb-grid"><div><span>حال</span><strong>'+escapeHtml(form.verb.present)+'</strong></div><div><span>گذشته</span><strong>'+escapeHtml(form.verb.past)+'</strong></div><div><span>آینده</span><strong>'+escapeHtml(form.verb.future)+'</strong></div></div>';
      html+='</div>';
    }
    if(state.showExamples){
      html+='<div class="supplement-card example-panel"><div class="example-head"><div><div class="supp-title">جملهٔ مثال</div><div class="example-status"></div></div><button class="example-sound-btn" id="exampleSoundBtn" type="button" aria-label="تلفظ جملهٔ مثال">🔊</button></div><p class="example-en" id="exampleEn">'+escapeHtml(ex)+'</p><p class="example-fa" id="exampleFa">'+escapeHtml(localFa)+'</p></div>';
    }
    return html?'<div class="supplementary" id="supplementary">'+html+'</div>':'';
  }
  async function prepareSupplementary(){
    if(!state.current||!state.revealed||!state.showExamples)return;
    const word=state.current.word;
    const fixed=preferredExample(word);
    if(fixed){
      if($('exampleEn'))$('exampleEn').textContent=fixed.en;
      if($('exampleFa'))$('exampleFa').textContent=fixed.fa;
      if($('exampleSoundBtn'))$('exampleSoundBtn').onclick=speakExample;
      return;
    }
    let ex=exampleReady?pickExample(word):'';
    if(!ex)ex=await fetchDictionaryExample(word);
    if(!state.current||state.current.word!==word)return;
    if($('exampleEn'))$('exampleEn').textContent=ex||'مثال مناسبی پیدا نشد.';
    if($('exampleSoundBtn'))$('exampleSoundBtn').onclick=speakExample;
    if(!ex){if($('exampleFa'))$('exampleFa').textContent=fallbackExample(word).fa;return}
    const cachedFa=exampleTranslationCache[ex];
    if(usablePersianTranslation(ex,cachedFa)){if($('exampleFa'))$('exampleFa').textContent=cachedFa;return}
    if($('exampleFa'))$('exampleFa').textContent='در حال ترجمه…';
    const fa=await translateExample(ex,word);
    if(state.current&&state.current.word===word&&$('exampleFa'))$('exampleFa').textContent=fa||'ترجمهٔ دقیق این جمله در دسترس نیست.';
  }

  function reveal(){if(state.revealed)return;state.revealed=true;$('meaning')?.classList.add('revealed');$('supplementary')?.classList.add('visible');prepareSupplementary()}
  function syncFavoriteButton(){const btn=$('favoriteBtn'),w=state.current?.word;if(!btn||!w)return;const active=state.favorites.has(w);btn.classList.toggle('active',active);btn.textContent=active?'★':'☆';btn.setAttribute('aria-label',active?'حذف نشان':'نشان کردن')}
  function toggleFavorite(){if(!state.current)return;const w=state.current.word;if(state.favorites.has(w)){state.favorites.delete(w);showToast('از کلمات نشان‌شده حذف شد.')}else{state.favorites.add(w);showToast('به کلمات نشان‌شده اضافه شد.')}syncFavoriteButton();try{save()}catch{}if(state.favoritesOnly&&!state.favorites.has(w)){setTimeout(()=>{const next=chooseWord();if(next)renderCard(next);else renderEmpty('هنوز کلمه‌ای برای تمرین نشان نکرده‌اید.')},180)}}
  function renderEmpty(message){state.current=null;content.innerHTML=`<div class="empty-state"><div><h2>چیزی برای نمایش نیست</h2><p>${escapeHtml(message)}</p></div></div>`;updateAllStats()}

  function renderCard(item,{preserve=false}={}){
    const card=document.querySelector('.main-card');if(card)card.classList.remove('swap-correct','swap-wrong','entering');
    state.current=item;state.revealed=preserve?state.revealed:false;const word=item.word,meaning=state.words[word]||'—',display=cleanDisplayWord(word),h=state.history[word]||{correct:0,wrong:0},form=state.forms[word]||null;
    content.innerHTML=`
      <div class="progress-head"><span>پیشرفت کلی</span><strong id="progressPercent">${formatPct()}</strong></div>
      <div class="progress-track" aria-label="پیشرفت کلی"><div class="progress-fill" style="width:${Math.max(0,progressPercent())}%"></div></div>
      <div class="study-strip">
        <div class="study-chip"><strong id="currentLayerStat">—</strong><span>لایه فعلی</span></div>
        <div class="study-chip streak-chip" id="currentStreakChip"><strong id="currentStreakStat">${state.streak.toLocaleString('fa-IR')}</strong><span>استریک فعلی</span></div>
        <div class="study-chip" id="bestStreakChip"><strong id="currentBestStat">${state.bestStreak.toLocaleString('fa-IR')}</strong><span>رکورد استریک</span></div>
        <div class="study-chip"><strong id="learnedStat">${learnedCount().toLocaleString('fa-IR')}</strong><span>کلمات یاد گرفته شده</span></div>
        <div class="study-chip word-history-chip"><strong id="historyStat">بلد بودم ${h.correct.toLocaleString('fa-IR')} · بلد نبودم ${h.wrong.toLocaleString('fa-IR')}</strong><span>سابقه این کلمه</span></div>
      </div>
      <div class="flashcard">
        <div class="word-zone">
          <div class="word-line"><h2 class="word">${escapeHtml(display)}</h2></div>
          <div class="word-tools"><button class="favorite-btn ${state.favorites.has(word)?'active':''}" id="favoriteBtn" type="button" aria-label="${state.favorites.has(word)?'حذف نشان':'نشان کردن'}">${state.favorites.has(word)?'★':'☆'}</button><button class="sound-btn" id="soundBtn" type="button"><span class="sound-icon">🔊</span><span>تلفظ</span></button></div>
          <div class="meaning-wrap"><div class="meaning ${state.revealed?'revealed':''}" id="meaning" role="button" tabindex="0"><span class="meaning-text" id="meaningText">${escapeHtml(meaning)}</span></div></div>${buildSupplementary(word)}
        </div>
      </div>
      <div class="actions"><button class="action-btn know" id="knowBtn" type="button">بلد بودم ✓</button><button class="action-btn dont" id="dontBtn" type="button">بلد نبودم ✕</button></div>`;
    $('meaning').addEventListener('click',reveal);$('meaning').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();reveal()}});$('soundBtn').addEventListener('click',speakWord);$('favoriteBtn').addEventListener('click',toggleFavorite);$('knowBtn').addEventListener('click',()=>answer(true));$('dontBtn').addEventListener('click',()=>answer(false));
    updateAllStats();if(state.revealed){$('supplementary')?.classList.add('visible');prepareSupplementary();}if(card){requestAnimationFrame(()=>card.classList.add('entering'));setTimeout(()=>card.classList.remove('entering'),320)}
  }

  function answer(correct){
    if(!state.current||state.locked)return;state.locked=true;document.querySelectorAll('.action-btn').forEach(b=>b.disabled=true);const item=state.current,card=document.querySelector('.main-card');if(card)card.classList.add(correct?'swap-correct':'swap-wrong');
    setTimeout(()=>{
      if(item.favoritePractice){state.locked=false;const next=chooseWord();if(next)renderCard(next);else renderEmpty('برای تمرین نشان‌شده‌ها، چند کلمه را با ستاره انتخاب کنید.');return}
      const word=item.word,li=item.layerIndex,h=state.history[word]||(state.history[word]={correct:0,wrong:0});
      if(correct){h.correct+=1;if(li<state.activeLayerCount)state.progressUnits+=stepUnit();state.streak+=1;state.bestStreak=Math.max(state.bestStreak,state.streak);const to=li+1;if(to>=TOTAL_LAYERS_MAX){state.layers[li].delete(word);state.mastered.add(word)}else moveWord(word,li,to)}
      else{h.wrong+=1;state.streak=0;if(state.wrongMovesBack){if(li>0)state.progressUnits=Math.max(0,state.progressUnits-stepUnit());moveWord(word,li,Math.max(0,li-1))}}
      save();state.locked=false;const next=chooseWord();if(next)renderCard(next);else renderEmpty(state.favoritesOnly?'برای تمرین نشان‌شده‌ها کلمهٔ دیگری وجود ندارد.':'برای تنظیم فعلی لایه‌ها و سطح‌ها کلمهٔ دیگری باقی نمانده است.');
    },210)
  }

  function setActiveLayerCount(value){state.activeLayerCount=clamp(Math.floor(Number(value)||5),1,TOTAL_LAYERS_MAX);save();const next=chooseWord();if(next)renderCard(next);else renderEmpty('با این تعداد لایه و فیلترهای فعلی، کلمه‌ای برای نمایش نیست.')}
  function toggleLevel(level){if(state.enabledLevels.has(level)){if(state.enabledLevels.size===1){showToast('حداقل یک سطح باید روشن باشد.');return}state.enabledLevels.delete(level)}else state.enabledLevels.add(level);save();const next=chooseWord();if(next)renderCard(next);else renderEmpty('با سطح‌های انتخاب‌شده، کلمه‌ای برای نمایش نیست.')}
  function toggleFavoritesOnly(){state.favoritesOnly=!state.favoritesOnly;save();const next=chooseWord();if(next)renderCard(next);else renderEmpty(state.favoritesOnly?'هنوز کلمه‌ای را نشان نکرده‌اید.':'با تنظیمات فعلی کلمه‌ای برای نمایش نیست.')}

  function showConfirm(){ $('modalBackdrop').classList.add('open');$('modalBackdrop').setAttribute('aria-hidden','false');$('modalConfirm').focus() }
  function closeConfirm(){ $('modalBackdrop').classList.remove('open');$('modalBackdrop').setAttribute('aria-hidden','true') }
  function resetProgress(){
    closeConfirm();state.layers=Array.from({length:TOTAL_LAYERS_MAX},()=>new Set());for(const w of Object.keys(state.words))state.layers[0].add(w);state.mastered.clear();state.progressUnits=0;save();const next=chooseWord();if(next)renderCard(next);else renderEmpty('داده‌ای برای تمرین وجود ندارد.')
  }

  function formatTime(sec){const s=Math.max(0,Math.floor(sec));const m=Math.floor(s/60),r=s%60;return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`}
  function currentTimerSeconds(){if(state.timerRunning&&state.timerEnd)return Math.max(0,Math.ceil((state.timerEnd-Date.now())/1000));return state.timerSeconds}
  function showTimerDone(){const modal=$('timerDoneBackdrop');if(modal){modal.classList.add('open');modal.setAttribute('aria-hidden','false');$('timerDoneClose')?.focus()}}
  function closeTimerDone(){const modal=$('timerDoneBackdrop');if(modal){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}}
  function updateTimerPresetButtons(){const current=Math.floor((state.timerSeconds||0)/60);document.querySelectorAll('[data-minutes]').forEach(btn=>btn.classList.toggle('active',!state.timerRunning&&current>0&&Number(btn.dataset.minutes)===current))}
  function syncTimerState(){const sec=currentTimerSeconds();state.timerSeconds=sec;if(state.timerRunning&&sec<=0){state.timerRunning=false;state.timerEnd=0;if(!state.timerCompletionShown){state.timerCompletionShown=true;showTimerDone()}}$('timerDisplay').textContent=formatTime(sec);$('timerDisplay').classList.toggle('done',sec===0&&!!state.timerSeconds);const startBtn=$('timerStartBtn');if(startBtn){startBtn.textContent=state.timerRunning?'مکث':'شروع';startBtn.disabled=sec<=0}updateTimerPresetButtons()}
  function persistTimer(){save()}
  function setTimerMinutes(min){const n=Math.floor(Number(min)||0);if(!n)return;const sec=clamp(n,1,1440)*60;state.timerSeconds=sec;state.timerEnd=0;state.timerRunning=false;state.timerCompletionShown=false;syncTimerState();persistTimer()}
  function startTimer(){if(state.timerRunning){pauseTimer();return}const remaining=currentTimerSeconds();if(remaining<=0)return;state.timerEnd=Date.now()+remaining*1000;state.timerRunning=true;state.timerCompletionShown=false;syncTimerState();persistTimer();startTimerLoop()}
  function pauseTimer(){if(!state.timerRunning)return;state.timerSeconds=currentTimerSeconds();state.timerRunning=false;state.timerEnd=0;syncTimerState();persistTimer()}
  function resetTimer(){state.timerEnd=0;state.timerRunning=false;state.timerSeconds=0;state.timerCompletionShown=false;syncTimerState();persistTimer()}
  function timerLoop(){syncTimerState();if(state.timerRunning)timerTick=setTimeout(timerLoop,500)}
  function startTimerLoop(){if(timerTick)clearTimeout(timerTick);timerLoop()}
  function clearTimerLoop(){if(timerTick)clearTimeout(timerTick);timerTick=null}
  function showToast(msg){const t=$('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(showToast._t);showToast._t=setTimeout(()=>t.classList.remove('show'),1800)}

  $('themeToggle').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';applyTheme();save()});
  $('layerRange').addEventListener('input',e=>{$('layerRangeValue').textContent=Number(e.target.value).toLocaleString('fa-IR')});$('layerRange').addEventListener('change',e=>setActiveLayerCount(e.target.value));document.querySelectorAll('.level-filter').forEach(btn=>btn.addEventListener('click',()=>toggleLevel(btn.dataset.level)));$('favoriteMode').addEventListener('click',toggleFavoritesOnly);$('exampleToggle').addEventListener('click',()=>{state.showExamples=!state.showExamples;save();if(state.current)renderCard(state.current,{preserve:true});});$('formsToggle').addEventListener('click',()=>{state.showForms=!state.showForms;save();if(state.current)renderCard(state.current,{preserve:true});});$('wrongMovesBackToggle').addEventListener('click',()=>{state.wrongMovesBack=!state.wrongMovesBack;save();updateToolToggles();});
  function openHelp(){const m=$('helpBackdrop');if(!m)return;m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');const active=m.querySelector('.help-tab.active')||m.querySelector('.help-tab');active?.focus()}
  function closeHelp(){const m=$('helpBackdrop');if(!m)return;m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open')}
  function selectHelpTab(tab){document.querySelectorAll('.help-tab').forEach(btn=>{const active=btn===tab;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',String(active));btn.setAttribute('tabindex',active?'0':'-1')});document.querySelectorAll('.help-panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.tab===tab.dataset.tab))}
  $('helpToggle').addEventListener('click',openHelp);$('helpClose').addEventListener('click',closeHelp);$('helpBackdrop').addEventListener('click',e=>{if(e.target===$('helpBackdrop'))closeHelp()});document.querySelectorAll('.help-tab').forEach(btn=>btn.addEventListener('click',()=>selectHelpTab(btn)));
  document.querySelectorAll('.brand-mark img,.livan-logo').forEach(img=>img.addEventListener('dragstart',e=>e.preventDefault()));
  document.querySelectorAll('[data-minutes]').forEach(btn=>btn.addEventListener('click',()=>setTimerMinutes(btn.dataset.minutes)));$('customMinutes').addEventListener('input',e=>setTimerMinutes(e.target.value));$('timerStartBtn').addEventListener('click',startTimer);$('timerResetBtn').addEventListener('click',resetTimer);$('resetBtn').addEventListener('click',showConfirm);$('modalCancel').addEventListener('click',closeConfirm);$('modalConfirm').addEventListener('click',resetProgress);$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))closeConfirm()});$('timerDoneClose').addEventListener('click',closeTimerDone);$('timerDoneBackdrop').addEventListener('click',e=>{if(e.target===$('timerDoneBackdrop'))closeTimerDone()});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeConfirm();closeTimerDone();closeHelp()}});
  window.addEventListener('beforeunload',()=>{syncTimerState();save()});document.addEventListener('visibilitychange',()=>{syncTimerState();if(document.visibilityState==='visible')startTimerLoop()});

  async function start(){
    try{
      const [wr,lr,fr]=await Promise.all([fetch(WORDS_URL,{cache:'default'}),fetch(LEVELS_URL,{cache:'default'}),fetch(FORMS_URL,{cache:'default'})]);if(!wr.ok||!lr.ok||!fr.ok)throw new Error('load failed');const [words,levels,forms]=await Promise.all([wr.json(),lr.json(),fr.json()]);if(!words||typeof words!=='object'||Array.isArray(words)||Object.keys(words).length!==TOTAL_WORDS_EXPECTED)throw new Error('words count mismatch');if(!levels||typeof levels!=='object'||Object.keys(levels).length!==TOTAL_WORDS_EXPECTED)throw new Error('levels count mismatch');state.words=words;state.levels=levels;state.forms=forms||{};initState();updateAllStats();startTimerLoop();loadExamples();const next=chooseWord();if(next)renderCard(next);else renderEmpty(state.favoritesOnly?'هنوز کلمه‌ای برای تمرین نشان نکرده‌اید.':'با تنظیمات فعلی کلمه‌ای برای نمایش نیست.');
    }catch(err){content.innerHTML=`<div class="empty-state"><div><h2>خواندن داده‌ها ممکن نشد</h2><p>فایل‌های <code>words.json</code> و <code>word_levels.json</code> باید کنار <code>index.html</code> باشند.</p></div></div>`;console.error(err)}
  }
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  start();
})();