const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
function element(value = '') {
  return { value, textContent: '', type: '', disabled: false, classList: { add(){}, remove(){}, toggle(){} }, listeners: {}, addEventListener(name, fn){ this.listeners[name] = fn; }, setAttribute(){}, replaceChildren(...items){this.options=items;this.value=items[0]?.value;this.selectedIndex=0;}, focus(){}, select(){} };
}
const ids = Object.fromEntries(['category','value','from','to','result','formula','status','swap'].map(id=>[id,element()]));
ids.category.value='length'; ids.value.value='1000';
const doc={getElementById:id=>ids[id]};
vm.runInNewContext(fs.readFileSync('unidades/app.js','utf8'),{document:doc,Option:function(label,value){this.label=label;this.value=value;},Intl,Number,Math,Object});
function change(cat,v,origin,target){ids.category.value=cat;ids.category.listeners.change();ids.value.value=v;ids.from.value=origin;ids.to.value=target;ids.value.listeners.input();return ids.result.textContent;}
assert.equal(change('length','1000','m','km'),'1 km');
assert.equal(change('temperature','0','C','F'),'32 °F');
assert.equal(change('temperature','-273,15','C','K'),'0 K');
assert.equal(change('volume','1','gal','L'),'3,78541178 L');
assert.equal(change('mass','1','lb','kg'),'0,45359237 kg');
assert.equal(change('length','1.609,344','m','mi'),'—');
assert.equal(ids.status.textContent,'Informe um número válido, sem separador de milhar.');
const form=element();const size=element('20'),password=element(),reveal=element(),copy=element(),status=element();
form.elements={lower:{checked:true},upper:{checked:true},digits:{checked:true},symbols:{checked:true}};
form.querySelector=()=>element();
const pids={'password-form':form,length:size,password,reveal,copy,status};
vm.runInNewContext(fs.readFileSync('senhas/app.js','utf8'),{document:{getElementById:id=>pids[id]},globalThis:{crypto:webcrypto},Uint32Array,Object,Number,String});
form.listeners.submit({preventDefault(){}});
assert.equal(password.value.length,20);
assert.match(password.value,/[a-z]/); assert.match(password.value,/[A-Z]/);
assert.match(password.value,/[0-9]/); assert.match(password.value,/[!@#$%&*+\-=\?_]/);
form.elements.lower.checked=form.elements.upper.checked=form.elements.digits.checked=form.elements.symbols.checked=false;
form.listeners.submit({preventDefault(){}});
assert.match(status.textContent,/Marque ao menos/);
console.log('Conversões, entradas inválidas e geração criptográfica: OK');
