const p = document.createElement('p');
p.appendChild(document.createTextNode('[entry2]' + typeof window.Promise + '[/entry2]'));
document.body.appendChild(p);
