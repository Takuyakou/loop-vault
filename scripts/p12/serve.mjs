/* global console, process, URL */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const port=Number(process.argv[2]??8120);
http.createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'scripts/p12/midi-measure.html';const path=resolve(root,relative);if(!path.startsWith(root)||!['scripts'+sep+'p12'+sep,'p12-generated'+sep].some(prefix=>path.startsWith(root+prefix))) {res.writeHead(403).end();return;}const data=await readFile(path);res.setHeader('Content-Type',path.endsWith('.html')?'text/html; charset=utf-8':path.endsWith('.mjs')?'text/javascript; charset=utf-8':path.endsWith('.png')?'image/png':'application/json');res.end(data);}catch{res.writeHead(404).end('Not found');}}).listen(port,'127.0.0.1',()=>console.log('P12 review http://127.0.0.1:'+port));
