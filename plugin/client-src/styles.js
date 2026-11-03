export const CSS = `
.lc-locked { padding: 48px 32px; max-width: 560px; }
.lc-locked h2 { font-size: 20px; font-weight: 500; margin: 0 0 8px; }
.lc-root {
  --lc-ink: var(--dsw-alias-label-primary, #16181f);
  --lc-muted: var(--dsw-alias-label-secondary, rgba(22,24,31,.56));
  --lc-line: var(--dsw-alias-border-l1, rgba(22,24,31,.12));
  --lc-surface: var(--dsw-alias-bg-base, #fff);
  --lc-raised: var(--dsw-alias-bg-elevated, rgba(22,24,31,.035));
  --lc-accent: #b44a63;
  --lc-teal: #b44a63;
  --lc-warm: #4b587c;
  --lc-serif: Georgia, "Songti SC", "Noto Serif SC", "SimSun", serif;
  height: 100%; min-height: 100%; width: 100%; container-type: inline-size; display: flex; flex-direction: column;
  overflow: hidden; box-sizing: border-box;
  background: var(--lc-surface); color: var(--lc-ink);
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif);
}
.lc-root * { box-sizing: border-box; }

/* 头部 */
.lc-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 18px;
  padding: calc(24px + var(--dsh-frame-top-clearance, 0px)) clamp(24px, 4vw, 56px) 0;
}
.lc-title { margin: 0; font-family: var(--lc-serif); font-size: 30px; font-weight: 600; letter-spacing: .01em; line-height: 1.05; }
.lc-presence { display: flex; align-items: center; gap: 8px; margin-top: 9px; font-size: 12.5px; color: var(--lc-muted); }
.lc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--lc-teal); box-shadow: 0 0 0 3px rgba(42,167,155,.14); }
.lc-dot.idle { background: var(--lc-muted); box-shadow: none; }
.lc-close { border: 0; background: transparent; color: var(--lc-muted); cursor: pointer; font-size: 22px; line-height: 1; padding: 2px 8px; border-radius: 8px; }
.lc-close:hover { color: var(--lc-ink); background: var(--lc-raised); }

.lc-modes-row { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.lc-modes { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--lc-line); border-radius: 999px; background: var(--lc-raised); }
.lc-mode { border: 0; background: transparent; padding: 6px 14px; border-radius: 999px; font-size: 13px; color: var(--lc-muted); cursor: pointer; }
.lc-mode.on { background: var(--lc-surface); color: var(--lc-ink); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.lc-group-select { width: auto; min-width: 180px; }
.lc-group-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin-bottom: 26px; border: 1px solid var(--lc-line); border-radius: 12px; overflow: hidden; background: var(--lc-line); }
.lc-stat { display: flex; flex-direction: column; gap: 4px; padding: 18px 20px; background: var(--lc-surface); }
.lc-stat b { font-family: var(--lc-serif); font-size: 28px; font-weight: 600; line-height: 1; }
.lc-stat span { font-size: 12px; color: var(--lc-muted); }
.lc-group { padding: 22px 0; border-top: 1px solid var(--lc-line); }
.lc-group h3 { margin: 0 0 14px; font-family: var(--lc-serif); font-size: 19px; font-weight: 600; }
.lc-member { display: grid; grid-template-columns: minmax(0, 1fr) 120px 72px; gap: 14px; align-items: center; padding: 10px 0; border-bottom: 1px dashed var(--lc-line); }
.lc-member:last-child { border-bottom: 0; }
.lc-member-name { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.lc-member-name strong { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lc-member-name span { font-size: 12px; color: var(--lc-muted); }
.lc-meter { height: 4px; border-radius: 999px; background: var(--lc-raised); overflow: hidden; }
.lc-meter i { display: block; height: 100%; border-radius: inherit; background: var(--lc-teal); }
.lc-member-affection { font-size: 12px; color: var(--lc-muted); text-align: right; }
.lc-note { margin: 0 0 10px; padding-left: 12px; border-left: 2px solid var(--lc-teal); font-size: 13.5px; line-height: 1.7; color: var(--lc-ink); }
.lc-note-add { display: flex; gap: 8px; margin-top: 14px; }
.lc-note-add .lc-input { flex: 1; }

/* 页签 */
.lc-tabs { display: flex; gap: 26px; padding: 6px clamp(24px, 4vw, 56px) 0; border-bottom: 1px solid var(--lc-line); overflow-x: auto; scrollbar-width: none; }
.lc-tabs::-webkit-scrollbar { display: none; }
.lc-tab {
  appearance: none; border: 0; background: none; cursor: pointer;
  font: inherit; font-size: 13px; color: var(--lc-muted);
  padding: 12px 0 13px; margin-bottom: -1px; border-bottom: 2px solid transparent;
}
.lc-tab:hover { color: var(--lc-ink); }
.lc-tab[aria-selected="true"] { color: var(--lc-ink); border-bottom-color: var(--lc-accent); }
.lc-tab:focus-visible { outline: 2px solid var(--lc-accent); outline-offset: 2px; border-radius: 4px; }

/* 内容区 */
.lc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 30px clamp(24px, 4vw, 56px) 48px; }
.lc-body.flush { padding: 0; display: flex; flex-direction: column; }

/* 概览 */
.lc-now { display: flex; flex-direction: column; gap: 6px; padding-bottom: 22px; border-bottom: 1px solid var(--lc-line); }
.lc-now-label { font-size: 12px; color: var(--lc-muted); }
.lc-now-value { font-family: var(--lc-serif); font-size: 23px; line-height: 1.3; }
.lc-now-value em { font-style: normal; }
.lc-now-cause { font-size: 12px; color: var(--lc-muted); line-height: 1.6; }

.lc-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; border-bottom: 1px solid var(--lc-line); }
.lc-fact { padding: 18px 0 18px 18px; border-left: 1px solid var(--lc-line); }
.lc-fact:first-child { padding-left: 0; border-left: 0; }
.lc-fact dt { font-size: 11.5px; color: var(--lc-muted); margin-bottom: 7px; }
.lc-fact dd { margin: 0; font-family: var(--lc-serif); font-size: 17px; line-height: 1.2; }
.lc-fact dd small { display: block; margin-top: 4px; font-family: var(--dsw-font-family, sans-serif); font-size: 11px; color: var(--lc-muted); }

.lc-needs { padding: 20px 0; border-bottom: 1px solid var(--lc-line); display: grid; gap: 12px; }
.lc-need { display: grid; grid-template-columns: 42px 1fr 44px; align-items: center; gap: 12px; font-size: 12px; color: var(--lc-muted); }
.lc-need-track { height: 3px; background: var(--lc-line); border-radius: 2px; overflow: hidden; }
.lc-need-fill { height: 100%; background: var(--lc-accent); border-radius: 2px; transition: width .4s ease; }
.lc-need:nth-child(2) .lc-need-fill { background: var(--lc-teal); }
.lc-need:nth-child(3) .lc-need-fill { background: var(--lc-warm); }
.lc-need b { font-weight: 500; color: var(--lc-ink); text-align: right; font-variant-numeric: tabular-nums; }

.lc-lines { padding: 6px 0 0; }
.lc-line { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 11px 0; border-bottom: 1px solid var(--lc-line); font-size: 13px; }
.lc-line:last-child { border-bottom: 0; }
.lc-line span { color: var(--lc-muted); }
.lc-line b { font-weight: 500; font-variant-numeric: tabular-nums; }

/* 星图 */
.lc-star-bar { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 20px; border-bottom: 1px solid var(--lc-line); font-size: 12px; color: var(--lc-muted); }
.lc-star-bar b { color: var(--lc-ink); font-weight: 500; }
.lc-star-actions { display: flex; align-items: center; gap: 14px; }
.lc-star-frame { flex: 1; min-height: 0; width: 100%; border: 0; background: #090d18; }

/* 表单 */
.lc-group { padding: 22px 0; border-bottom: 1px solid var(--lc-line); }
.lc-group:first-child { padding-top: 0; }
.lc-group:last-child { border-bottom: 0; }
.lc-group h3 { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.lc-group p.lc-hint { margin: 0 0 14px; font-size: 11.5px; line-height: 1.6; color: var(--lc-muted); }
.lc-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 7px 0; }
.lc-row > label { font-size: 12.5px; color: var(--lc-ink); }
.lc-row .lc-sub { display: block; margin-top: 3px; font-size: 11px; color: var(--lc-muted); }
.lc-field { display: flex; align-items: center; gap: 8px; }
.lc-input {
  border: 1px solid var(--lc-line); border-radius: 7px; padding: 6px 8px;
  background: var(--lc-surface); color: var(--lc-ink); font: inherit; font-size: 12px; width: 78px;
}
.lc-input.wide { width: 100%; max-width: 380px; }
.lc-input:focus-visible { outline: 2px solid var(--lc-accent); outline-offset: 1px; }
.lc-btn {
  border: 1px solid var(--lc-line); background: var(--lc-raised); color: var(--lc-ink);
  border-radius: 7px; padding: 6px 12px; font: inherit; font-size: 12px; cursor: pointer;
}
.lc-btn:hover { border-color: var(--lc-accent); color: var(--lc-accent); }
.lc-btn.primary { background: var(--lc-accent); border-color: var(--lc-accent); color: #fff; }
.lc-btn.primary:hover { filter: brightness(1.05); color: #fff; }
.lc-btn:disabled { opacity: .45; cursor: default; }
.lc-btn:focus-visible, .lc-switch:focus-visible { outline: 2px solid var(--lc-accent); outline-offset: 2px; }

.lc-switch { position: relative; width: 38px; height: 22px; border-radius: 999px; border: 0; background: var(--lc-line); cursor: pointer; flex: none; padding: 0; }
.lc-switch.on { background: var(--lc-accent); }
.lc-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .16s ease; }
.lc-switch.on::after { left: 19px; }

.lc-msg { font-size: 12px; margin: 10px 0 0; color: var(--lc-muted); }
.lc-msg.err { color: #c0392b; }
.lc-pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.7; border: 1px solid var(--lc-line); border-radius: 8px; padding: 12px 14px; margin: 12px 0 0; background: var(--lc-raised); }

/* 危险操作与确认弹层 */
.lc-danger { border-top: 1px solid var(--lc-line); padding-top: 20px; margin-top: 22px; }
.lc-danger h3 { color: #c0392b; }
.lc-btn.danger { background: #c0392b; border-color: #c0392b; color: #fff; }
.lc-btn.danger:hover { filter: brightness(.95); color: #fff; }
.lc-btn.danger:disabled { opacity: .4; }
.lc-modal { position: fixed; inset: 0; z-index: 90; background: rgba(8,10,18,.5); display: flex; align-items: center; justify-content: center; padding: 24px; }
.lc-modal-card { width: min(460px, 100%); background: var(--lc-surface, #fff); color: var(--lc-ink, #16181f); border-radius: 12px; padding: 24px 26px; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
.lc-modal-card h3 { margin: 0 0 10px; font-size: 15px; }
.lc-modal-card p { margin: 0 0 10px; font-size: 12.5px; line-height: 1.7; color: rgba(120,120,130,.95); }
.lc-modal-card .lc-input { width: 100%; margin: 6px 0 16px; }
.lc-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }

/* 底部图标 */
.lc-icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; opacity: .62; }
.lc-icon:hover, .lc-icon.active { opacity: 1; background: rgba(127,127,127,.12); }

/* 浮层 */
.lc-overlay { position: fixed; inset: 0; z-index: 80; background: rgba(8,10,18,.42); display: flex; justify-content: flex-end; }
.lc-overlay > div {
  width: min(980px, 96vw); height: 100%; background: var(--lc-surface);
  box-shadow: -24px 0 70px rgba(0,0,0,.3); overflow: hidden;
  animation: lc-in .22s cubic-bezier(.2,.7,.3,1) both;
}
@keyframes lc-in { from { transform: translateX(14px); opacity: .4; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .lc-overlay > div { animation: none; }
  .lc-need-fill, .lc-switch::after { transition: none; }
}
@media (max-width: 760px) {
  .lc-head, .lc-tabs { padding-left: 20px; padding-right: 20px; }
  .lc-body { padding: 20px; }
  .lc-facts { grid-template-columns: 1fr; }
  .lc-fact { border-left: 0; padding-left: 0; border-top: 1px solid var(--lc-line); }
  .lc-fact:first-child { border-top: 0; }
}

/* 字号与密度：整体放大一档，重要信息更像主角 */
.lc-root { font-size: 14px; }
.lc-title { font-size: 34px; }
.lc-presence { font-size: 13.5px; }
.lc-tab { font-size: 14.5px; padding: 14px 0 15px; }
.lc-body { padding: 30px 38px 44px; }
.lc-now-label { font-size: 13px; }
.lc-now-value { font-size: 27px; }
.lc-now-cause { font-size: 13px; }
.lc-actions { display: flex; gap: 10px; padding: 16px 0; border-bottom: 1px solid var(--lc-line); }
.lc-fact dt { font-size: 13px; }
.lc-fact dd { font-size: 21px; }
.lc-fact dd small { font-size: 12.5px; }
.lc-need { font-size: 13.5px; grid-template-columns: 48px 1fr 52px; }
.lc-need-track { height: 4px; }
.lc-line { font-size: 14.5px; padding: 13px 0; }
.lc-group h3 { font-size: 15px; }
.lc-group p.lc-hint { font-size: 13px; }
.lc-row > label { font-size: 13.5px; }
.lc-row .lc-sub { font-size: 12px; }
.lc-input { font-size: 13.5px; padding: 8px 10px; }
.lc-btn { font-size: 13.5px; padding: 8px 14px; }
.lc-switch { width: 42px; height: 24px; }
.lc-switch::after { width: 18px; height: 18px; }
.lc-switch.on::after { left: 21px; }
.lc-modal-card p { font-size: 13.5px; }
.lc-modal-card h3 { font-size: 17px; }

/* 再放大一档 + 防重叠 */
.lc-root { font-size: 15px; }
.lc-title { font-size: 36px; }
.lc-presence { font-size: 14px; }
.lc-tab { font-size: 15.5px; }
.lc-body { font-size: 15px; }
.lc-now-value { font-size: 29px; }
.lc-fact dd { font-size: 22px; }
.lc-line { font-size: 15.5px; }
.lc-group h3 { font-size: 16px; }
.lc-group p.lc-hint { font-size: 14px; }
.lc-row > label { font-size: 14px; }
.lc-btn { font-size: 14px; }
.lc-input { font-size: 14px; }
.lc-row { flex-wrap: wrap; }
.lc-row > .lc-field { flex-wrap: wrap; min-width: 0; }
.lc-row > label { min-width: 0; }
.lc-line { flex-wrap: wrap; row-gap: 4px; }
.lc-line > span { min-width: 0; overflow-wrap: anywhere; }
.lc-line > b { margin-left: auto; white-space: nowrap; }
.lc-tabs { flex-wrap: wrap; }
.lc-input.wide { flex: 1 1 240px; max-width: 100%; min-width: 0; }
select.lc-input { width: auto; min-width: 160px; max-width: 100%; }
.lc-install { border: 1px solid var(--lc-line); border-radius: 10px; padding: 14px; margin: 12px 0 0; display: grid; gap: 8px; }
.lc-textarea { width: 100%; min-height: 92px; border: 1px solid var(--lc-line); border-radius: 8px; padding: 10px; font: inherit; font-size: 14px; line-height: 1.6; background: var(--lc-surface); color: var(--lc-ink); resize: vertical; }
.lc-textarea:focus-visible { outline: 2px solid var(--lc-accent); outline-offset: 1px; }
.lc-overview { display: grid; grid-template-columns: minmax(0, 1fr) 292px; gap: 40px; align-items: start; }
.lc-overview-main { display: grid; min-width: 0; }
.lc-overview-rail { display: grid; gap: 20px; align-content: start; border-left: 1px solid var(--lc-line); padding-left: 30px; }
.lc-rail-title { margin: 0; font-size: 12px; font-weight: 500; letter-spacing: .04em; color: var(--lc-muted); }
.lc-info { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; margin-left: 6px; border: 1px solid var(--lc-line); border-radius: 50%; color: var(--lc-muted); font-size: 10px; cursor: help; vertical-align: 1px; }
.lc-info:hover, .lc-info:focus-visible { color: var(--lc-accent); border-color: var(--lc-accent); outline: none; }
.lc-info::after { content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 8px); transform: translate(-50%, 2px); width: max-content; max-width: 260px; padding: 8px 10px; border-radius: 8px; background: #1d2130; color: #f2f4fa; font-size: 12.5px; line-height: 1.5; text-align: left; white-space: normal; box-shadow: 0 8px 24px rgba(0,0,0,.35); opacity: 0; pointer-events: none; transition: opacity .12s ease, transform .12s ease; z-index: 30; }
.lc-info:hover::after, .lc-info:focus-visible::after { opacity: 1; transform: translate(-50%, 0); }
.lc-advanced { margin-top: 4px; border-top: 1px dashed var(--lc-line); padding-top: 4px; }
.lc-advanced summary { cursor: pointer; color: var(--lc-muted); font-size: 13px; padding: 8px 0; list-style: none; }
.lc-advanced summary::-webkit-details-marker { display: none; }
.lc-advanced summary::before { content: "+"; display: inline-block; width: 16px; }
.lc-advanced[open] summary::before { content: "−"; }
.lc-unit { font-size: 12.5px; color: var(--lc-muted); }
.lc-tmpl { border-bottom: 1px solid var(--lc-line); }
.lc-tmpl summary { display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 11px 0; font-size: 14.5px; list-style: none; }
.lc-tmpl summary::-webkit-details-marker { display: none; }
.lc-tmpl summary::before { content: ">"; width: 14px; color: var(--lc-muted); transition: transform .15s ease; }
.lc-tmpl[open] summary::before { transform: rotate(90deg); }
.lc-tmpl-count { margin-left: auto; font-size: 12px; color: var(--lc-muted); }
.lc-tmpl-list { display: grid; gap: 8px; padding: 2px 0 14px 24px; }
.lc-tmpl-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lc-tmpl-text { flex: 1 1 220px; min-width: 0; font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
.lc-mini { border: 0; background: none; color: var(--lc-muted); font: inherit; font-size: 12.5px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.lc-mini:hover { background: var(--lc-raised); color: var(--lc-ink); }
.lc-mini.danger:hover { color: #c0392b; }
.lc-mini.add { justify-self: start; margin-top: 2px; color: var(--lc-accent); }


/* 新布局：左侧导航栏 + 右侧内容，减少头部堆叠 */
.lc-root { display: grid; grid-template-columns: 236px minmax(0, 1fr); grid-template-rows: auto 1fr; position: relative; }
.lc-head { grid-column: 1; grid-row: 1; flex-direction: column; align-items: flex-start; gap: 18px; padding: 28px 20px 12px; border-right: 1px solid var(--lc-line); }
.lc-head > div { width: 100%; }
.lc-close { position: absolute; top: 12px; right: 14px; }
.lc-tabs { grid-column: 1; grid-row: 2; flex-direction: column; align-items: stretch; gap: 2px; padding: 6px 12px 20px; border-right: 1px solid var(--lc-line); border-bottom: 0; overflow: visible; }
.lc-tab { text-align: left; padding: 9px 12px; border-radius: 8px; color: var(--lc-muted); }
.lc-tab[aria-selected="true"] { background: var(--lc-raised); color: var(--lc-ink); font-weight: 500; border-bottom-color: transparent; box-shadow: inset 3px 0 0 var(--lc-teal); }
.lc-body { grid-column: 2; grid-row: 1 / span 2; overflow: auto; padding: 42px clamp(28px, 5vw, 64px) 56px; }
.lc-body > * { max-width: 820px; }
.lc-locked { grid-column: 2; grid-row: 1 / span 2; }
.lc-msg { position: fixed; right: 24px; bottom: 18px; z-index: 8; margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--lc-raised); box-shadow: 0 6px 24px rgba(0,0,0,.12); }
.lc-msg.err { background: #fdecea; }

.lc-title { font-size: 26px; }
.lc-presence { margin-top: 8px; font-size: 12px; }
.lc-modes-row { margin-top: 12px; }
.lc-modes { width: 100%; display: flex; }
.lc-mode { flex: 1; padding: 7px 10px; }
.lc-group-select { width: 100%; margin-top: 8px; }
.lc-group { border-top: 0; padding: 0 0 30px; }
.lc-group + .lc-group { border-top: 1px solid var(--lc-line); padding-top: 26px; }
.lc-group h3 { font-size: 18px; margin-bottom: 12px; }
.lc-group-stats { margin-bottom: 30px; }
.lc-note-add { max-width: 560px; }

@media (max-width: 760px) {
  .lc-root { display: flex; flex-direction: column; }
  .lc-head { border-right: 0; border-bottom: 1px solid var(--lc-line); padding: 18px 18px 10px; }
  .lc-tabs { flex-direction: row; gap: 18px; padding: 0 18px; border-right: 0; border-bottom: 1px solid var(--lc-line); overflow-x: auto; }
  .lc-tab { padding: 12px 0; border-radius: 0; }
  .lc-tab[aria-selected="true"] { background: transparent; }
  .lc-body { padding: 24px 18px 40px; }
  .lc-msg { left: 18px; right: 18px; bottom: 12px; }
}

/* 最终视觉：贴近宿主工具的轻量单列，不再用左侧导航 */
.lc-root { display: flex; flex-direction: column; }
.lc-head { flex-direction: row; align-items: center; gap: 12px; padding: 18px 24px 10px; border-right: 0; }
.lc-head-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.lc-close { position: static; }
.lc-tabs { flex-direction: row; gap: 22px; padding: 0 24px; border-right: 0; border-bottom: 1px solid var(--lc-line); overflow-x: auto; }
.lc-tab { padding: 10px 0; border-radius: 0; background: none; box-shadow: none; }
.lc-tab[aria-selected="true"] { background: none; box-shadow: none; border-bottom: 2px solid var(--lc-accent); }
.lc-body { width: 100%; max-width: 820px; margin: 0 auto; padding: 28px 24px 40px; overflow: auto; }
.lc-body > * { max-width: none; }
.lc-title { font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif); font-size: 20px; font-weight: 600; letter-spacing: 0; }
.lc-presence { margin-top: 4px; font-size: 12px; }
.lc-modes { width: auto; padding: 2px; border: 0; background: var(--lc-raised); }
.lc-mode { flex: none; padding: 5px 12px; font-size: 12.5px; }
.lc-group-select { width: auto; min-width: 150px; height: 30px; margin-top: 0; }
.lc-group { border-top: 0; padding: 0 0 24px; }
.lc-group + .lc-group { border-top: 0; padding-top: 0; }
.lc-group h3 { font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif); font-size: 14px; font-weight: 600; margin: 0 0 8px; }
.lc-hint { font-size: 12px; line-height: 1.65; }
.lc-row { padding: 10px 0; border-bottom: 1px solid var(--lc-line); }
.lc-row:last-child { border-bottom: 0; }
.lc-input { height: 34px; }
.lc-btn { height: 32px; padding: 0 12px; font-size: 13px; }
.lc-facts { border: 0; background: var(--lc-raised); border-radius: 10px; }
.lc-stat { padding: 14px 16px; }
.lc-stat b { font-family: var(--dsw-font-family, sans-serif); font-size: 24px; }
.lc-member { grid-template-columns: minmax(0, 1fr) 90px 64px; }

@media (max-width: 760px) {
  .lc-head { padding: 14px 16px 8px; align-items: flex-start; flex-wrap: wrap; }
  .lc-head-actions { width: 100%; margin-left: 0; }
  .lc-tabs { padding: 0 16px; gap: 18px; }
  .lc-body { padding: 20px 16px 32px; }
}

/* 心跳页 */
.lc-heartbeat { max-width: 860px; }
.lc-heart-hero { position: relative; display: grid; place-items: center; gap: 8px; padding: 32px 0 18px; border-bottom: 1px solid var(--lc-line); text-align: center; }
.lc-heart-svg { width: 92px; height: 84px; fill: none; stroke: var(--lc-accent); stroke-width: 2.1; stroke-linejoin: round; animation: lc-beat 1.9s ease-in-out infinite; filter: drop-shadow(0 0 20px rgba(180,74,99,.28)); }
@keyframes lc-beat { 0%, 100% { transform: scale(1); } 12% { transform: scale(1.07); } 24% { transform: scale(1); } 36% { transform: scale(1.04); } }
.lc-heart-rate { display: flex; align-items: baseline; gap: 6px; font-family: var(--lc-serif); }
.lc-heart-rate b { font-size: 46px; line-height: 1; font-weight: 600; color: var(--lc-accent); }
.lc-heart-rate span { font-size: 11px; letter-spacing: .08em; color: var(--lc-muted); }
.lc-heart-caption { margin: 2px 0 0; font-size: 13px; color: var(--lc-muted); }
.lc-heart-note { margin: 0; font-size: 11px; color: var(--lc-muted); }
.lc-ecg { width: min(320px, 82%); height: 40px; fill: none; stroke: var(--lc-accent); stroke-width: 1.4; opacity: .55; stroke-dasharray: 340; stroke-dashoffset: 340; animation: lc-ecg 3.2s linear infinite; }
@keyframes lc-ecg { to { stroke-dashoffset: 0; } }
.lc-heart-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1px; background: var(--lc-line); border-bottom: 1px solid var(--lc-line); }
.lc-heart-cell { display: flex; flex-direction: column; gap: 7px; padding: 18px 16px; background: var(--lc-surface); }
.lc-heart-cell span { font-size: 12px; color: var(--lc-muted); }
.lc-heart-cell b { font-size: 20px; font-weight: 500; }
.lc-heart-track { height: 3px; border-radius: 99px; background: var(--lc-raised); overflow: hidden; }
.lc-heart-track i { display: block; height: 100%; border-radius: inherit; background: var(--lc-accent); }
.lc-heart-lines { margin-top: 8px; }
@media (max-width: 760px) { .lc-heart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .lc-heart-rate b { font-size: 38px; } }

/* 窄屏与缩放适配 */
.lc-row { flex-wrap: wrap; gap: 8px 16px; }
.lc-row > label { min-width: 0; overflow-wrap: anywhere; }
.lc-row > .lc-field { min-width: 0; max-width: 100%; flex-wrap: wrap; }
.lc-row .lc-input, .lc-row .lc-textarea, .lc-input.wide, .lc-textarea { max-width: 100%; box-sizing: border-box; }
.lc-hint, .lc-msg { overflow-wrap: anywhere; }
.lc-facts { min-width: 0; }
@media (max-width: 980px) {
  .lc-heart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lc-tabs { overflow-x: auto; flex-wrap: nowrap; }
}
@media (max-width: 820px) {
  .lc-row { align-items: stretch; }
  .lc-row > .lc-field { width: 100%; justify-content: flex-start; }
  .lc-row > .lc-field .lc-input { flex: 1 1 120px; }
  .lc-head { flex-wrap: wrap; }
  .lc-head-actions { width: 100%; margin-left: 0; flex-wrap: wrap; }
  .lc-body { padding-left: 16px; padding-right: 16px; }
}

/* 容器查询：面板在宽窗口里被塞窄时也能适配，不依赖浏览器窗口宽度 */
@container love-panel (max-width: 900px) {
  .lc-overview { grid-template-columns: 1fr; gap: 6px; }
  .lc-overview-rail { border-left: 0; padding-left: 0; border-top: 1px solid var(--lc-line); padding-top: 20px; }
}
@container love-panel (max-width: 820px) {
  .lc-row { align-items: stretch; }
  .lc-row > .lc-field { width: 100%; justify-content: flex-start; }
  .lc-row > .lc-field .lc-input { flex: 1 1 120px; }
  .lc-head { flex-wrap: wrap; }
  .lc-head-actions { width: 100%; margin-left: 0; flex-wrap: wrap; }
  .lc-body { padding-left: 16px; padding-right: 16px; }
  .lc-heart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container love-panel (max-width: 620px) {
  .lc-tabs { gap: 14px; }
  .lc-facts { grid-template-columns: 1fr; }
  .lc-fact { border-left: 0; padding-left: 0; border-top: 1px solid var(--lc-line); padding-top: 14px; }
  .lc-fact:first-child { border-top: 0; }
  .lc-heart-grid { grid-template-columns: 1fr; }
  .lc-modes { width: 100%; }
  .lc-mode { flex: 1; }
}
/* Percentage dimensions already fill the containing block under CSS zoom.
   Dividing them by zoom again shrinks the viewport and clips the scroll area. */
.lc-root { min-width: 0; container-name: love-panel; }
.lc-head, .lc-tabs { flex: 0 0 auto; min-width: 0; max-width: 100%; }
.lc-body { flex: 1 1 auto; min-height: 0; min-width: 0; overflow-x: hidden; overscroll-behavior: contain; }
.lc-body.lc-overview { max-width: none; }
.lc-overview-main, .lc-overview-rail { min-width: 0; overflow-wrap: anywhere; }
.lc-head-actions { flex-wrap: wrap; min-width: 0; }
.lc-group-select { min-width: 0; max-width: 100%; }
.lc-settings-card, .lc-row, .lc-member { min-width: 0; overflow-wrap: anywhere; }
.lc-zoom { border: 1px solid var(--lc-line); background: var(--lc-raised); color: var(--lc-muted); font: inherit; font-size: 11px; padding: 5px 7px; border-radius: 6px; cursor: pointer; }
.lc-zoom:disabled { opacity: .35; cursor: default; }
.lc-zoom[aria-pressed="true"] { color: var(--lc-accent); border-color: var(--lc-accent); }

.lc-settings-menu { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr)); gap: 10px; padding-bottom: 10px; }
.lc-settings-menu > .lc-hint { grid-column: 1 / -1; margin: 0 0 2px; }
.lc-settings-card { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-height: 88px; padding: 16px; border: 1px solid var(--lc-line); border-radius: 10px; background: var(--lc-surface); color: var(--lc-ink); font: inherit; text-align: left; cursor: pointer; }
.lc-settings-card:hover { border-color: var(--lc-accent); background: var(--lc-raised); }
.lc-settings-card b { font-size: 14px; font-weight: 500; }
.lc-settings-card span { font-size: 12px; color: var(--lc-muted); }
.lc-settings-card em { margin-top: auto; font-size: 11px; color: var(--lc-accent); font-style: normal; }
.lc-settings-back { margin: 0 0 16px; padding: 0; border: 0; background: none; color: var(--lc-accent); font: inherit; font-size: 12px; cursor: pointer; }
`;
