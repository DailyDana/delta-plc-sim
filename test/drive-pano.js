// Pano testi: boş devreye parçaları insertPart ile ekle, sonucu IL olarak konsola yaz

tabs = []; activeTab = 0; openInNewTab("pano", "LD X0\nOUT Y0"); prog = { rungs: [], labels: {} }; commit();
const P = (k) => PARTS.find((p) => p.k === k);
insertPart(P('NO'), null, 'right');                 // yeni satır: X0 -> Y0
const c0 = prog.rungs[0].input[0].id;
insertPart(P('NC'), c0, 'right');                   // X0 sağına kapalı kontak
insertPart(P('NO'), c0, 'par');                     // X0'a paralel
insertPart(P('TMR'), prog.rungs[0].outputs[0].id);  // Y0 altına TMR
insertPart(P('SET'), null);                          // yeni satır SET
toggleEraser(true);
const out = toIL(prog);
document.title = 'IL:' + out.replace(/\n/g, '|');
// bırakma işaretini göster
dragPart = P('NO');
const hit = document.querySelector(`#ladder .hit[data-sel="${prog.rungs[0].input[1].id}"]`);
const b = { x: +hit.getAttribute('x'), y: +hit.getAttribute('y'), w: +hit.getAttribute('width'), h: +hit.getAttribute('height') };
showDropInd({ id: prog.rungs[0].input[1].id, zone: 'par', info: locate(prog.rungs[0].input[1].id), box: b });
