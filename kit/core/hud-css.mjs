export const HUD_CSS = `
:root{
  color-scheme: dark;
  --bg:#0E0F10; --panel:#16171A; --panel2:#1F2024; --line:#2C2E33; --ink:#ECE7DC; --mute:#8D8F96; --phosphor:#3CFF8F;
  --accent:#FF5A1F; --accent-ink:#16110D; --current:#56B4E9; --force:#009E73; --heat:#E69F00; --field:#CC79A7; --signal:#F0E442; --error:#D55E00;
  --f-ui:"IBM Plex Sans Condensed","Arial Narrow",system-ui,sans-serif;
  --f-mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
  --f-dot:"Doto","JetBrains Mono",ui-monospace,monospace;
}
[hidden]{display:none!important}
html,body{height:100%;overflow:hidden}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-ui);font-size:14px;transition:background .4s}
#stage{position:fixed;inset:0}
#stage canvas{display:block;width:100%;height:100%;touch-action:none}
#hud{position:fixed;inset:0;pointer-events:none;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:max(14px,env(safe-area-inset-top,0px)) max(14px,env(safe-area-inset-bottom,0px))}
#hud button,#hud input,#hud select{pointer-events:auto}
#hud button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.brand{display:flex;align-items:baseline;gap:10px}
.brand b{font-family:var(--f-dot);font-weight:900;font-size:22px;letter-spacing:.04em;color:var(--accent)}
.brand span{font-family:var(--f-mono);font-size:11px;color:var(--mute);letter-spacing:.08em;text-transform:uppercase}
#readouts{position:absolute;top:max(14px,env(safe-area-inset-top,0px));left:max(16px,env(safe-area-inset-left,0px));display:grid;gap:6px;max-width:min(520px,calc(100% - 380px))}
.bigbox{display:flex;align-items:baseline;gap:8px}
.bigbox .num em{font-style:normal;font-family:var(--f-dot);font-weight:900;font-size:clamp(40px,7vw,64px);line-height:.9;color:var(--phosphor);font-variant-numeric:tabular-nums;text-shadow:0 0 18px color-mix(in srgb,var(--phosphor) 35%,transparent)}
.bigbox .unit{font-family:var(--f-mono);color:var(--mute);font-size:12px;letter-spacing:.1em}
.minis{display:flex;flex-wrap:wrap;gap:4px 16px;font-family:var(--f-mono);font-size:12px;font-variant-numeric:tabular-nums}
.minis i{font-style:normal;color:var(--mute);font-size:10px;letter-spacing:.1em;display:block;text-transform:uppercase}
.minis em{font-style:normal;font-family:var(--f-dot);font-weight:700;font-size:20px;color:var(--ink)}
.objective:not(:empty){margin-top:4px;font-family:var(--f-mono);font-size:12px;color:var(--ink);background:color-mix(in srgb,var(--panel) 85%,transparent);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;padding:6px 10px;width:fit-content;max-width:100%}
#panel{position:absolute;right:max(16px,env(safe-area-inset-right,0px));top:max(14px,env(safe-area-inset-top,0px));width:340px;max-height:calc(100% - 90px);overflow:auto;pointer-events:auto;background:color-mix(in srgb,var(--panel) 92%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid var(--line);border-radius:14px;padding:16px}
#card{display:grid;gap:12px}
#card header h2{margin:2px 0 0;font-size:22px;line-height:1.1;font-weight:600;text-wrap:balance}
.eyebrow{font-family:var(--f-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)}
#card p{margin:0;line-height:1.45;color:var(--ink)}
#card p.q{font-size:16px;font-weight:500}
.note{font-size:12px;color:var(--mute)!important;line-height:1.45}
.actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.primary,.ghost,.chip,.opt,.tool,.look{cursor:pointer;border-radius:9px;border:1px solid var(--line);background:var(--panel2);padding:8px 12px;font-size:14px}
.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)!important;font-weight:600}
.primary:disabled{opacity:.35;cursor:not-allowed}
.ghost{color:var(--mute)!important}
.pred-num{display:grid;gap:6px}
.pred-num output{font-family:var(--f-dot);font-weight:900;font-size:40px;color:var(--accent);font-variant-numeric:tabular-nums}
.pred-num input{width:100%;accent-color:var(--accent)}
.opts{display:grid;gap:6px}
.opt{text-align:left}
.opt[aria-pressed="true"],.chip[aria-pressed="true"]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.conf{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;color:var(--mute)}
.chip{padding:5px 9px;font-size:12px}
.yourpred{font-family:var(--f-mono);font-size:12px;color:var(--mute)}
.yourpred b{color:var(--accent)}
.status{font-family:var(--f-mono);font-size:12px;color:var(--mute);min-height:1.2em}
.status.ok{color:var(--phosphor)}
.hint{font-size:13px;border-left:2px solid var(--signal);padding-left:8px}
.verdict{display:grid;gap:4px;border-radius:10px;padding:10px;border:1px solid var(--line);background:var(--panel2);font-family:var(--f-mono);font-size:13px}
.verdict span{color:var(--mute)}
.verdict.ok{border-color:color-mix(in srgb,var(--phosphor) 60%,var(--line))}
.verdict.no{border-color:color-mix(in srgb,var(--error) 70%,var(--line))}
.verdict p{font-family:var(--f-ui);font-size:13px}
.eqline{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--panel2)}
.eqline .f,.eqcard .f{font-family:var(--f-mono);font-size:15px}
.eqline .live,.eqcard .live{font-family:var(--f-mono);font-size:12px;color:var(--mute);font-variant-numeric:tabular-nums;margin-top:3px}
.unlock{display:grid;gap:2px;border-radius:12px;padding:10px 12px;background:color-mix(in srgb,var(--accent) 14%,var(--panel2));border:1px solid var(--accent)}
.unlock span{font-family:var(--f-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.unlock b{font-family:var(--f-mono);font-size:16px}
.unlock small{color:var(--mute)}
.starrow{display:flex;gap:6px;font-size:30px;color:var(--line)}
.starrow .on{color:var(--signal);animation:pop .5s cubic-bezier(.2,1.6,.4,1) both}
.starrow .on:nth-child(2){animation-delay:.18s}.starrow .on:nth-child(3){animation-delay:.36s}
@keyframes pop{from{transform:scale(.2);opacity:0}to{transform:scale(1);opacity:1}}
#tools{position:absolute;left:max(16px,env(safe-area-inset-left,0px));bottom:max(14px,env(safe-area-inset-bottom,0px));display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.tool{font-size:13px;padding:7px 11px;background:color-mix(in srgb,var(--panel) 90%,transparent)}
.tool.hot{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)!important;font-weight:600}
.looks{display:inline-flex;gap:6px;padding:4px;border-radius:999px;border:1px solid var(--line);background:color-mix(in srgb,var(--panel) 90%,transparent)}
.look{width:22px;height:22px;padding:0;border-radius:50%;border:2px solid var(--line)}
.look[data-look="bench"]{background:#1d1f22}.look[data-look="cyanotype"]{background:#0f3358}.look[data-look="paper"]{background:#e9e6df}
.look[aria-pressed="true"]{border-color:var(--accent)}
#perf{position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:max(14px,env(safe-area-inset-bottom,0px));font-family:var(--f-mono);font-size:10.5px;color:var(--mute);font-variant-numeric:tabular-nums}
#badge{position:absolute;left:50%;top:max(16px,env(safe-area-inset-top,0px));transform:translateX(-50%);font-family:var(--f-mono);font-size:11px;letter-spacing:.14em;color:#111;background:var(--signal);padding:4px 9px;border-radius:5px}
#toast{position:absolute;left:50%;bottom:70px;transform:translateX(-50%);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px}
#toolbox{position:absolute;left:max(16px,env(safe-area-inset-left,0px));bottom:64px;width:min(360px,calc(100% - 32px));max-height:55%;overflow:auto;pointer-events:auto;display:grid;gap:8px;background:color-mix(in srgb,var(--panel) 95%,transparent);border:1px solid var(--line);border-radius:14px;padding:12px}
.tb-head{display:flex;align-items:baseline;gap:8px}.tb-head span{color:var(--mute);font-size:12px;flex:1}
.x{cursor:pointer;background:none;border:0;font-size:20px;color:var(--mute)!important}
.eqcard{border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--panel2)}
.eqcard .src{font-family:var(--f-mono);font-size:10px;color:var(--mute);margin-top:4px}
#tags,#wtags{position:absolute;inset:0;pointer-events:none}
.tag{position:absolute;left:0;top:0;font-family:var(--f-mono);font-size:11px;color:var(--ink);background:color-mix(in srgb,var(--panel) 90%,transparent);border:1px solid var(--line);border-radius:6px;padding:3px 7px;white-space:nowrap;pointer-events:none}
.tag.grab{border-color:var(--accent);color:var(--accent)}
#modal{position:absolute;inset:0;display:grid;place-items:center;pointer-events:auto;background:color-mix(in srgb,var(--bg) 55%,transparent);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));overflow:auto}
.map{width:min(920px,100%);display:grid;gap:14px;background:color-mix(in srgb,var(--panel) 96%,transparent);border:1px solid var(--line);border-radius:18px;padding:20px}
.map header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-end}
.map h1{margin:4px 0 2px;font-family:var(--f-dot);font-weight:900;font-size:clamp(34px,6vw,54px);line-height:.95;color:var(--ink);letter-spacing:.01em}
.map .sub{margin:0;color:var(--mute);max-width:60ch;line-height:1.45}
.map .meta{display:grid;gap:6px;justify-items:end}
.starsum{font-family:var(--f-mono);color:var(--mute)}.starsum b{font-family:var(--f-dot);font-size:28px;color:var(--signal)}
.verified{font-family:var(--f-mono);font-size:12px;color:var(--phosphor);border:1px solid color-mix(in srgb,var(--phosphor) 50%,var(--line));border-radius:999px;padding:4px 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.lvl{cursor:pointer;text-align:left;display:grid;gap:4px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);min-height:112px;align-content:start}
.lvl:hover:not(:disabled){border-color:var(--accent)}
.lvl .n{font-family:var(--f-dot);font-weight:900;font-size:22px;color:var(--accent)}
.lvl .t{font-weight:600;font-size:15px;line-height:1.2}
.lvl .m{font-family:var(--f-mono);font-size:10.5px;color:var(--mute);letter-spacing:.06em;text-transform:uppercase}
.lvl .s{color:var(--signal);letter-spacing:.1em}
.lvl.boss{grid-column:1/-1;min-height:0;border-style:dashed}
.lvl:disabled{opacity:.55;cursor:not-allowed}
.lvl .lock{font-size:12px;color:var(--mute)}
.recall{border:1px solid var(--signal);border-radius:12px;padding:12px;display:grid;gap:8px;background:var(--panel2)}
.recall p{margin:0}
.map footer{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center}
@media (max-width:760px){
  #readouts{max-width:calc(100% - 32px)}
  #panel{top:auto;bottom:62px;left:max(12px,env(safe-area-inset-left,0px));right:max(12px,env(safe-area-inset-right,0px));width:auto;max-height:44%}
  #perf{display:none}
  #badge{top:auto;bottom:calc(46% + 70px)}
  .grid{grid-template-columns:1fr 1fr}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;
