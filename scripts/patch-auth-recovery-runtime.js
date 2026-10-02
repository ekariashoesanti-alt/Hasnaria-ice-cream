const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const dist=path.join(process.cwd(),'dist');
const required=['auth-bootstrap.js','password-reset-bootstrap.js','index.html','forgot-password.html','forgot-password.js','set-password.html','set-password.js','auth-recovery.css','password-policy.js','account-manager-v1.css'];
for(const rel of required){const file=path.join(dist,rel);if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('required auth artifact missing: '+rel)}
const authPath=path.join(dist,'auth-bootstrap.js');
const resetPath=path.join(dist,'password-reset-bootstrap.js');
const indexPath=path.join(dist,'index.html');
let auth=fs.readFileSync(authPath,'utf8');
const trampoline=`(function(){try{var u=new URL(location.href);if(u.searchParams.get('password-activation')==='1'){u.pathname='/set-password.html';u.searchParams.delete('password-activation');location.replace(u.toString());return}}catch(_){}})();\n`;
if(!auth.startsWith('(function(){try{var u=new URL(location.href);'))auth=trampoline+auth;
fs.writeFileSync(authPath,auth);
const reset=`(function(){\n'use strict';\nfunction bind(){var btn=document.getElementById('resetBtn');if(!btn||btn.__hasnariaRecoveryBound)return;btn.__hasnariaRecoveryBound=true;btn.addEventListener('click',function(){location.href='/forgot-password.html'});}\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();\n})();\n`;
fs.writeFileSync(resetPath,reset);
let html=fs.readFileSync(indexPath,'utf8');
const oldAccountCss='<link rel="stylesheet" href="/account-manager-v1.css?v=3">';
const accountCss='<link rel="stylesheet" href="/account-manager-v1.css?v=4">';
html=html.replace(oldAccountCss,accountCss);
if(!html.includes(accountCss))html=html.replace('</head>',accountCss+'\n</head>');
fs.writeFileSync(indexPath,html);
for(const file of [authPath,resetPath,path.join(dist,'forgot-password.js'),path.join(dist,'set-password.js')]){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)}
if(!auth.includes("u.pathname='/set-password.html'"))throw new Error('set-password trampoline missing');
if(!reset.includes("location.href='/forgot-password.html'"))throw new Error('forgot-password navigation missing');
if(!html.includes(accountCss))throw new Error('Account Manager stylesheet preload missing');
if(html.includes(oldAccountCss))throw new Error('stale Account Manager stylesheet preload remains');
console.log('Auth recovery runtime: PASS (dedicated forgot/set-password flow + Account Manager CSS v4 preloaded)');