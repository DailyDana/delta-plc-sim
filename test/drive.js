// Ekran görüntüsü testi (headless Edge): shotN.html -> N. örneği yükle, RUN, 8 s simüle et, X0'a kısa bas
tabs = []; activeTab = 0; openInNewTab("test", "LD X0\nOUT Y0");

const exNo = +((location.pathname.match(/shot(\d+)\.html/) || [0, 0])[1]);
loadIL(PLC_EXAMPLES[exNo].il);
mode = 'run'; sim.reset();
for (let i = 0; i < 800; i++) scanOnce(10);
inputs.X0 = true; for (let i = 0; i < 5; i++) scanOnce(10);
inputs.X0 = false; for (let i = 0; i < 30; i++) scanOnce(10);
mode = 'pause'; updateView();
try { select(prog.rungs[1].outputs[1].id); } catch (e) { select(prog.rungs[0].input[0].id); }
