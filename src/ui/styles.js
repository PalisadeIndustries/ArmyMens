// All UI styling, injected once. Toy-army-box aesthetic: cardboard, olive drab, stencil type, rubber stamps.
export const CSS = `
#ui{--olive:#4d5d2a;--olive-d:#262f14;--olive-l:#7c8f45;--khaki:#cdb47c;--card:#eadcb4;--card-d:#cdb98a;--ink:#1c1e12;--red:#c9301c;--red-d:#8f1d0f;
  --yellow:#f6c935;--green:#86c24a;--tan:#e0b974;--stencil:Impact,Haettenschweiler,'Arial Narrow Bold','Inter Display','Inter','Liberation Sans',sans-serif;
  font-family:var(--stencil);color:#f5ecd2;user-select:none;-webkit-user-select:none;letter-spacing:.02em}
#ui *{box-sizing:border-box}
#ui .pf-layer{position:absolute;inset:0}
#ui .pf-hide{display:none!important}
#ui button{font-family:var(--stencil);cursor:pointer}
.pf-stencil{text-transform:uppercase;font-weight:900;letter-spacing:.06em}
.pf-grunge{-webkit-mask-image:var(--pf-grunge);mask-image:var(--pf-grunge);-webkit-mask-size:220px;mask-size:220px}
.pf-cut>span{display:inline-block;-webkit-mask-image:var(--pf-grunge),linear-gradient(180deg,#000 0 45%,transparent 45% 52%,#000 52%);
  -webkit-mask-composite:source-in;mask-image:var(--pf-grunge),linear-gradient(180deg,#000 0 45%,transparent 45% 52%,#000 52%);mask-composite:intersect;-webkit-mask-size:220px,100% 100%;mask-size:220px,100% 100%}

/* ===================== MENU ===================== */
#pf-menu{display:flex;flex-direction:column;pointer-events:auto;
  background:radial-gradient(ellipse 70% 55% at 50% 42%,rgba(0,0,0,0) 0%,rgba(10,14,4,.25) 55%,rgba(8,10,3,.85) 100%),
  linear-gradient(180deg,rgba(20,26,8,.55),rgba(0,0,0,0) 30%,rgba(0,0,0,0) 55%,rgba(14,16,6,.92) 100%)}
.pf-menu-top{display:flex;justify-content:space-between;align-items:flex-start;padding:26px 34px 0;gap:20px}
.pf-boxlabel{position:relative;background:var(--card);color:var(--ink);padding:16px 26px 14px;border:5px solid var(--ink);
  box-shadow:8px 8px 0 rgba(0,0,0,.55),inset 0 0 0 3px var(--card-d);transform:rotate(-1.5deg);max-width:62vw}
.pf-boxlabel:before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(120,90,40,.07) 0 3px,transparent 3px 7px);pointer-events:none}
.pf-title{font-size:min(5.6vw,96px);line-height:.86;margin:0;color:var(--olive);text-shadow:3px 3px 0 var(--olive-d);white-space:nowrap}
.pf-title .pf-front{color:var(--red);text-shadow:3px 3px 0 var(--red-d)}
.pf-tagline{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:13px;letter-spacing:.12em}
.pf-tagline span{background:var(--ink);color:var(--card);padding:3px 8px}
.pf-starburst{position:absolute;right:-40px;bottom:-44px;width:112px;height:112px;display:flex;align-items:center;justify-content:center;text-align:center;
  background:var(--yellow);color:var(--red-d);font-size:16px;line-height:1;transform:rotate(14deg);
  clip-path:polygon(50% 0,61% 13%,77% 6%,79% 22%,95% 25%,88% 40%,100% 50%,88% 60%,95% 75%,79% 78%,77% 94%,61% 87%,50% 100%,39% 87%,23% 94%,21% 78%,5% 75%,12% 60%,0 50%,12% 40%,5% 25%,21% 22%,23% 6%,39% 13%);
  animation:pf-wobble 3s ease-in-out infinite}
@keyframes pf-wobble{50%{transform:rotate(8deg) scale(1.06)}}
.pf-op{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
.pf-opstamp{border:4px solid var(--red);color:var(--red);padding:8px 16px;font-size:26px;transform:rotate(3deg);background:rgba(245,236,210,.9);
  box-shadow:4px 4px 0 rgba(0,0,0,.4);text-align:center;max-width:420px;line-height:1.05}
.pf-opstamp small{display:block;font-size:12px;letter-spacing:.3em;color:var(--ink);margin-bottom:4px}
.pf-btnrow{display:flex;gap:10px}
.pf-btn{background:var(--olive);color:#f5ecd2;border:3px solid var(--ink);padding:9px 16px;font-size:17px;text-transform:uppercase;letter-spacing:.08em;
  box-shadow:4px 4px 0 var(--ink);transition:transform .08s,box-shadow .08s,background .15s}
.pf-btn:hover{background:var(--olive-l);transform:translate(-1px,-1px);box-shadow:5px 5px 0 var(--ink)}
.pf-btn:active{transform:translate(3px,3px);box-shadow:1px 1px 0 var(--ink)}
.pf-btn.pf-red{background:var(--red)}.pf-btn.pf-red:hover{background:#e2452d}
.pf-btn.pf-big{font-size:34px;padding:12px 44px;box-shadow:6px 6px 0 var(--ink)}
.pf-btn.pf-ghost{background:rgba(20,24,10,.75)}
.pf-menu-mid{flex:1}
.pf-menu-bottom{padding:0 24px 22px;display:flex;flex-direction:column;align-items:center;gap:14px}
.pf-cards{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.pf-card{position:relative;width:186px;background:linear-gradient(180deg,#f3e8c6,#dccb98);color:var(--ink);border:4px solid var(--ink);border-radius:10px 10px 4px 4px;
  padding:26px 12px 10px;cursor:pointer;box-shadow:5px 5px 0 rgba(0,0,0,.55);transition:transform .12s,box-shadow .12s;text-align:left}
.pf-card:before{content:'';position:absolute;left:50%;top:7px;width:30px;height:9px;margin-left:-15px;border-radius:5px;background:rgba(0,0,0,.18);box-shadow:inset 0 2px 2px rgba(0,0,0,.4)}
.pf-card:hover{transform:translateY(-6px) rotate(-1deg);box-shadow:7px 11px 0 rgba(0,0,0,.5)}
.pf-card.pf-sel{transform:translateY(-12px);box-shadow:0 0 0 4px var(--yellow),7px 14px 0 rgba(0,0,0,.5)}
.pf-card .pf-key{position:absolute;right:8px;top:6px;font-size:13px;background:var(--ink);color:var(--card);padding:1px 6px}
.pf-blister{height:92px;margin:0 6px 8px;border-radius:40px 40px 12px 12px;background:radial-gradient(ellipse at 35% 20%,rgba(255,255,255,.75),rgba(255,255,255,.15) 40%,rgba(200,220,255,.12));
  border:2px solid rgba(255,255,255,.7);box-shadow:inset 0 -6px 12px rgba(0,0,0,.12);display:flex;justify-content:center;align-items:flex-end}
.pf-blister svg{height:86px;filter:drop-shadow(2px 3px 0 rgba(0,0,0,.25))}
.pf-card h3{margin:0;font-size:22px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:clip;line-height:1;color:var(--olive-d)}
.pf-card .pf-blurb{font-family:'Courier New',monospace;font-weight:700;font-size:11.5px;margin:4px 0 6px;min-height:42px;line-height:1.2;letter-spacing:0}
.pf-stat{display:flex;align-items:center;gap:6px;font-size:12px;margin:3px 0}
.pf-stat b{width:52px;white-space:nowrap}
.pf-stat i{flex:1;height:9px;background:rgba(0,0,0,.18);border:1px solid var(--ink);position:relative}
.pf-stat i:after{content:'';position:absolute;left:0;top:0;bottom:0;width:var(--v);background:var(--olive)}
.pf-weap{margin-top:6px;font-size:12px;border-top:2px dashed rgba(0,0,0,.35);padding-top:5px;line-height:1.35}
.pf-weap span{color:var(--red-d)}
.pf-deployrow{display:flex;gap:16px;align-items:center}
.pf-hint{font-size:13px;letter-spacing:.14em;color:#d8cfa8;text-shadow:1px 1px 0 #000}
.pf-sidepanel{position:absolute;right:30px;top:200px;width:300px;background:rgba(18,22,9,.88);border:3px solid var(--khaki);padding:14px 16px;box-shadow:6px 6px 0 rgba(0,0,0,.5)}
.pf-sidepanel h4{margin:0 0 8px;font-size:20px;color:var(--yellow)}
.pf-controls{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:14px;align-items:center}
.pf-controls kbd{font-family:var(--stencil);background:var(--card);color:var(--ink);border:2px solid var(--ink);border-bottom-width:4px;padding:0 6px;font-size:13px;border-radius:3px;justify-self:end;white-space:nowrap}
.pf-controls span{font-family:system-ui,sans-serif;font-weight:600;font-size:13px;color:#e8e0c0}

/* ===================== MODALS ===================== */
.pf-modal{display:flex;align-items:center;justify-content:center;pointer-events:auto;background:rgba(10,12,4,.72)}
.pf-sheet{position:relative;background:var(--card);color:var(--ink);border:5px solid var(--ink);padding:26px 34px;min-width:440px;max-width:760px;
  box-shadow:10px 10px 0 rgba(0,0,0,.6)}
.pf-sheet h2{margin:0 0 6px;font-size:56px;line-height:.95;color:var(--olive-d)}
.pf-sheet .pf-sub{font-family:'Courier New',monospace;font-weight:700;font-size:15px;margin-bottom:16px}
.pf-sheet .pf-btnrow{margin-top:18px;flex-wrap:wrap}
.pf-sheet .pf-bigstamp{position:absolute;right:-26px;top:-30px;border:6px double var(--red);color:var(--red);font-size:40px;padding:4px 16px;transform:rotate(12deg);background:rgba(234,220,180,.85)}
.pf-setrow{display:grid;grid-template-columns:210px 1fr 64px;gap:12px;align-items:center;margin:10px 0;font-size:18px}
.pf-setrow input[type=range]{accent-color:var(--olive);width:100%}
.pf-setrow output{font-family:'Courier New',monospace;font-weight:700;text-align:right}
.pf-setrow input[type=checkbox]{width:22px;height:22px;accent-color:var(--red)}
.pf-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:8px 0}
.pf-stats div{background:var(--ink);color:var(--card);padding:8px 10px;border-left:6px solid var(--olive-l)}
.pf-stats b{display:block;font-size:34px;color:var(--yellow);line-height:1}
.pf-stats span{font-size:12px;letter-spacing:.12em}
.pf-stats div.pf-gore{border-left-color:var(--red)}
.pf-tipline{font-family:'Courier New',monospace;font-weight:700;font-size:13px;margin-top:10px;opacity:.85}

/* ===================== HUD ===================== */
#pf-hud{text-shadow:2px 2px 0 rgba(0,0,0,.7)}
.pf-panel{position:absolute;background:linear-gradient(180deg,rgba(28,33,14,.86),rgba(16,19,8,.86));border:3px solid rgba(205,180,124,.85);box-shadow:4px 4px 0 rgba(0,0,0,.45)}
.pf-hp{left:22px;bottom:22px;width:330px;padding:10px 14px 12px}
.pf-hp .pf-row{display:flex;justify-content:space-between;align-items:flex-end}
.pf-hp .pf-cls{font-size:15px;color:var(--khaki);letter-spacing:.14em}
.pf-hp .pf-hpnum{font-size:44px;line-height:.9}
.pf-hpbar{position:relative;height:22px;margin-top:6px;background:rgba(0,0,0,.55);border:2px solid #000;overflow:hidden}
.pf-hpbar .pf-fill,.pf-hpbar .pf-ghostfill{position:absolute;left:0;top:0;bottom:0;transform-origin:0 50%;width:100%}
.pf-hpbar .pf-ghostfill{background:#fff6;transition:transform .5s .25s}
.pf-hpbar .pf-fill{background:linear-gradient(180deg,#a8dd62,#5c9a2d)}
.pf-hpbar.pf-low .pf-fill{background:linear-gradient(180deg,#ff6a47,#b1220f)}
.pf-hpbar:after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 30px,rgba(0,0,0,.6) 30px 33px)}
.pf-lives{display:flex;gap:4px;margin-top:8px;align-items:center;font-size:13px;color:var(--khaki);letter-spacing:.1em}
.pf-lives svg{width:16px;height:22px}
.pf-lives svg.pf-gone{opacity:.25}
.pf-ammo{right:22px;bottom:22px;width:300px;padding:8px 14px 10px;text-align:right}
.pf-ammo .pf-wname{font-size:16px;color:var(--khaki);letter-spacing:.14em}
.pf-ammo .pf-count{font-size:60px;line-height:.9}
.pf-ammo .pf-count small{font-size:26px;color:#cfc6a2}
.pf-ammo .pf-count.pf-lowammo{color:#ff6d4d}
.pf-ammo .pf-reload{font-size:18px;color:var(--yellow);height:20px}
.pf-ammo .pf-reload.pf-on{animation:pf-blink .5s steps(2) infinite}
.pf-secondary{font-size:14px;color:#bfb593;margin-top:2px}
@keyframes pf-blink{50%{opacity:.25}}
.pf-ability{right:340px;bottom:22px;width:86px;height:86px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;flex-direction:column;
  background:conic-gradient(rgba(246,201,53,.9) calc(var(--p)*1turn),rgba(10,12,4,.85) 0)}
.pf-ability:before{content:'';position:absolute;inset:7px;border-radius:50%;background:rgba(20,24,10,.95)}
.pf-ability>*{position:relative}
.pf-ability b{font-size:24px;line-height:1}
.pf-ability span{font-size:10px;letter-spacing:.08em;text-align:center;max-width:70px;line-height:1.05}
.pf-ability.pf-ready{border-color:var(--yellow);box-shadow:0 0 18px rgba(246,201,53,.6),4px 4px 0 rgba(0,0,0,.45)}
.pf-wave{left:50%;top:14px;transform:translateX(-50%);padding:6px 20px 8px;text-align:center;min-width:260px}
.pf-wave .pf-wnum{font-size:30px;line-height:1}
.pf-wave .pf-wsub{font-size:14px;color:var(--khaki);letter-spacing:.12em}
.pf-wave .pf-wsub b{color:var(--tan)}
.pf-wavebar{height:6px;margin-top:5px;background:rgba(0,0,0,.6)}
.pf-wavebar i{display:block;height:100%;background:var(--tan);transform-origin:0 50%}
.pf-obj{left:50%;top:96px;transform:translateX(-50%);width:340px;padding:6px 12px 8px;text-align:center;border-color:var(--red)}
.pf-obj .pf-otext{font-size:16px;letter-spacing:.14em;color:#ffb3a3;animation:pf-blink .8s steps(2) infinite}
.pf-objbar{height:14px;margin-top:4px;background:rgba(0,0,0,.6);border:2px solid #000}
.pf-objbar i{display:block;height:100%;background:repeating-linear-gradient(45deg,#e0b974 0 10px,#b78f4c 10px 20px);transform-origin:0 50%}
.pf-radar{left:22px;top:18px;width:184px;height:184px;border-radius:50%;padding:0;overflow:hidden;background:rgba(26,32,12,.85)}
.pf-radar canvas{width:100%;height:100%;display:block}
.pf-feed{position:absolute;right:20px;top:18px;width:420px;display:flex;flex-direction:column;align-items:flex-end;gap:5px}
.pf-kill{background:rgba(16,19,8,.82);padding:4px 10px;font-size:15px;display:flex;gap:7px;align-items:center;border-left:4px solid #777;animation:pf-slide .25s ease-out;transition:opacity .5s}
.pf-kill.pf-me{border-left-color:var(--yellow);background:rgba(60,48,10,.88)}
.pf-kill .g{color:var(--green)}.pf-kill .t{color:var(--tan)}
.pf-kill em{font-style:normal;font-size:11px;letter-spacing:.1em;background:var(--red);color:#fff;padding:1px 5px;text-shadow:none}
.pf-kill em.pf-how-head{background:var(--yellow);color:var(--ink)}.pf-kill em.pf-how-fire{background:#ff7a1a}.pf-kill em.pf-how-boom{background:#7a4cc2}.pf-kill em.pf-how-limb{background:#2f7fa8}.pf-kill em.pf-how-gun{background:#555}
@keyframes pf-slide{from{transform:translateX(40px);opacity:0}}
.pf-cross{position:absolute;left:50%;top:50%;width:0;height:0}
.pf-cross i{position:absolute;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.75)}
.pf-cross .u,.pf-cross .d{width:2px;height:10px;left:-1px}.pf-cross .l,.pf-cross .r{height:2px;width:10px;top:-1px}
.pf-cross .c{width:4px;height:4px;left:-2px;top:-2px;border-radius:50%}
.pf-hitm{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
.pf-hitm i{position:absolute;width:3px;height:12px;background:#fff;box-shadow:0 0 0 1px #000;left:-1.5px;top:-6px}
.pf-hitm.pf-k i{background:#ff3b22;height:16px;top:-8px}.pf-hitm.pf-h i{background:var(--yellow)}
.pf-dmg{position:absolute;left:50%;top:50%;width:0;height:0}
.pf-dmg i{position:absolute;left:-60px;top:-170px;width:120px;height:40px;opacity:0;
  background:radial-gradient(ellipse 50% 100% at 50% 100%,rgba(255,40,20,.95),rgba(255,40,20,0) 70%);clip-path:polygon(0 100%,50% 0,100% 100%,50% 70%);transform-origin:60px 170px}
.pf-vignette{background:radial-gradient(ellipse at center,rgba(150,0,0,0) 45%,rgba(150,0,0,.75) 100%);opacity:0}
.pf-flash{background:rgba(255,30,10,.25);opacity:0}
.pf-scope{display:none;background:radial-gradient(circle at 50% 50%,transparent 0,transparent 33vmin,#000 33.4vmin)}
.pf-scope:before,.pf-scope:after{content:'';position:absolute;left:50%;top:50%;background:#000}
.pf-scope:before{width:66.8vmin;height:2px;margin:-1px 0 0 -33.4vmin;background:linear-gradient(90deg,#000 0 40%,transparent 40% 49.5%,#000 49.5% 50.5%,transparent 50.5% 60%,#000 60%)}
.pf-scope:after{height:66.8vmin;width:2px;margin:-33.4vmin 0 0 -1px;background:linear-gradient(180deg,#000 0 40%,transparent 40% 49.5%,#000 49.5% 50.5%,transparent 50.5% 60%,#000 60%)}
.pf-scope i{position:absolute;left:50%;top:50%;width:66.8vmin;height:66.8vmin;margin:-33.4vmin;border-radius:50%;box-shadow:inset 0 0 6vmin 2vmin rgba(0,0,0,.85)}
.pf-banner{position:absolute;left:0;right:0;top:21%;display:flex;flex-direction:column;align-items:center;pointer-events:none}
.pf-banner .pf-bt{font-size:min(12vw,110px);line-height:.9;color:var(--yellow);text-shadow:5px 5px 0 var(--ink),-2px -2px 0 var(--ink),2px -2px 0 var(--ink),-2px 2px 0 var(--ink)}
.pf-banner .pf-bs{margin-top:8px;background:var(--ink);color:var(--card);padding:4px 16px;font-size:22px;letter-spacing:.18em;text-shadow:none}
.pf-banner.pf-clear .pf-bt{color:var(--green)}
.pf-banner.pf-danger .pf-bt{color:#ff5a3a}
.pf-banner.pf-show{animation:pf-stampin 2.8s cubic-bezier(.2,1.4,.4,1) forwards}
@keyframes pf-stampin{0%{transform:scale(2.6) rotate(-8deg);opacity:0}9%{transform:scale(.94) rotate(-3deg);opacity:1}14%{transform:scale(1) rotate(-3deg)}82%{opacity:1;transform:scale(1) rotate(-3deg)}100%{opacity:0;transform:scale(1.05) rotate(-3deg) translateY(-20px)}}
.pf-streak{position:absolute;left:0;right:0;top:63%;display:flex;flex-direction:column;align-items:center}
.pf-streak .pf-st{font-size:46px;color:#fff;text-shadow:3px 3px 0 var(--red-d),-2px -2px 0 var(--ink),2px -2px 0 var(--ink),-2px 2px 0 var(--ink),4px 4px 0 var(--ink)}
.pf-streak .pf-ss{font-size:16px;letter-spacing:.2em;color:var(--yellow)}
.pf-streak.pf-show{animation:pf-pop 2s ease-out forwards}
@keyframes pf-pop{0%{transform:scale(.3);opacity:0}12%{transform:scale(1.18);opacity:1}20%{transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:translateY(-14px)}}
.pf-bubble{position:absolute;left:0;top:0;max-width:240px;padding:6px 10px;background:#fffbe9;color:var(--ink);border:3px solid var(--ink);border-radius:14px;
  font-family:'Comic Sans MS','Chalkboard SE','Comic Neue',system-ui,sans-serif;font-weight:800;font-size:14px;line-height:1.15;text-shadow:none;
  box-shadow:3px 3px 0 rgba(0,0,0,.4);opacity:0;will-change:transform}
.pf-bubble:after{content:'';position:absolute;left:18px;bottom:-12px;border:9px solid transparent;border-top-color:var(--ink);border-bottom:0}
.pf-bubble.pf-tan{background:#ffe6c2}.pf-bubble.pf-scream{background:#ffdf3d;font-size:16px;transform-origin:20px 100%}
.pf-radio{position:absolute;left:50%;bottom:150px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;width:min(760px,80vw)}
.pf-radio div{background:rgba(10,12,4,.78);padding:4px 12px;font-family:system-ui,sans-serif;font-weight:700;font-size:16px;text-shadow:1px 1px 0 #000;animation:pf-slideup .2s ease-out;transition:opacity .4s;border-left:4px solid var(--green)}
.pf-radio div.pf-tan{border-left-color:var(--tan)}
.pf-radio b{font-family:var(--stencil);color:var(--green);letter-spacing:.08em;margin-right:6px}
.pf-radio div.pf-tan b{color:var(--tan)}
@keyframes pf-slideup{from{transform:translateY(10px);opacity:0}}
.pf-dead{display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(60,0,0,.2),rgba(30,0,0,.75))}
.pf-dead .pf-bt{font-size:min(13vw,120px);color:#ff5a3a;text-shadow:5px 5px 0 var(--ink);transform:rotate(-4deg)}
.pf-dead .pf-bs{font-size:24px;letter-spacing:.16em;background:var(--ink);padding:4px 14px;margin-top:10px}
.pf-relock{display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer}
.pf-relock div{background:rgba(10,12,4,.85);border:3px solid var(--yellow);padding:12px 26px;font-size:26px;letter-spacing:.1em}
.pf-intermission{position:absolute;left:50%;top:30%;transform:translateX(-50%);text-align:center}
.pf-intermission .a{font-size:20px;letter-spacing:.3em;color:var(--khaki)}
.pf-intermission .b{font-size:84px;line-height:1;color:var(--yellow);text-shadow:4px 4px 0 var(--ink)}
@media (max-width:900px){.pf-feed{width:300px}.pf-radar{width:130px;height:130px}.pf-sidepanel{display:none}.pf-card{width:150px}}
`;
