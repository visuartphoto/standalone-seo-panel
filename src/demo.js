const demoUser='demo@seopanel.dev', demoPassword='DemoSEO2026!';
const login=document.querySelector('#login-form'), app=document.querySelector('#demo-app'), status=document.querySelector('#login-status');
login.addEventListener('submit',e=>{e.preventDefault();const data=new FormData(login);if(data.get('email')!==demoUser||data.get('password')!==demoPassword){status.textContent='Login details do not match the demo account.';return;}document.querySelector('#login-view').hidden=true;app.hidden=false;});
document.querySelector('#logout').addEventListener('click',()=>{app.hidden=true;document.querySelector('#login-view').hidden=false;login.reset();});
document.querySelectorAll('[data-demo-tab]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-demo-tab]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('[data-demo-panel]').forEach(panel=>panel.hidden=panel.dataset.demoPanel!==button.dataset.demoTab);}));
document.querySelector('#demo-measure').addEventListener('click',e=>{e.currentTarget.textContent='Demo only · no provider request sent';e.currentTarget.disabled=true;});
