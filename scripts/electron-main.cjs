'use strict';
// Original portfolio launcher. Renderer has no Node access or privileged IPC.
const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const config=require('./app-config.json'),docs=path.join(__dirname,'docs');
const profile=path.resolve(process.env.REA_PROFILE_DIR||path.join(path.dirname(process.execPath),'profile'));
for(const sub of ['user','session','crash','logs'])fs.mkdirSync(path.join(profile,sub),{recursive:true});
app.setPath('userData',path.join(profile,'user'));app.setPath('sessionData',path.join(profile,'session'));app.setPath('crashDumps',path.join(profile,'crash'));app.setAppLogsPath(path.join(profile,'logs'));app.setName(config.name);
app.commandLine.appendSwitch('no-first-run');app.commandLine.appendSwitch('disable-breakpad');
let server,window;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.jsonl':'application/x-ndjson','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
app.whenReady().then(async()=>{
 session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
 server=http.createServer((req,res)=>{try{if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);const requested=path.resolve(docs,'.'+pathname),file=fs.existsSync(requested)&&fs.statSync(requested).isDirectory()?path.join(requested,'index.html'):requested;
 if(!file.startsWith(docs+path.sep)||!fs.realpathSync(file).startsWith(fs.realpathSync(docs)+path.sep)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");res.setHeader('Referrer-Policy','no-referrer');res.end(req.method==='HEAD'?undefined:fs.readFileSync(file));
 }catch(e){res.writeHead(404);res.end('Not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 window=new BrowserWindow({width:1250,height:900,show:!process.argv.includes('--self-test'),title:config.name,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==base)event.preventDefault();});
 await window.loadURL(base+'/'+config.entry);
 if(process.argv.includes('--self-test')){
  try{const result=await window.webContents.executeJavaScript('({title:document.title,heading:document.querySelector("h1")?.textContent,node:typeof require,selector:!!document.querySelector('+JSON.stringify(config.testSelector||'h1')+')})');if(!result.heading||!result.selector||result.node!=='undefined')throw Error('Renderer verification failed');console.log(JSON.stringify({passed:true,app:config.name,renderer:result,scope:'Packaged renderer load and isolation smoke; app-specific core/browser tests separate'}));app.quit();}catch(e){console.error(e.message);app.exit(1);}
 }
}).catch(error=>{console.error(error.message);app.exit(1)});
app.on('window-all-closed',()=>app.quit());app.on('will-quit',()=>{if(server)server.close();});
