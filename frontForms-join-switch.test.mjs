/* Join button switch tests (front end): node frontForms-join-switch.test.mjs */
import fs from 'fs';
import vm from 'vm';
const SRC = fs.readFileSync(new URL('./js/frontForms.js', import.meta.url).pathname, 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { console.log('FAIL', m); fails++; } else console.log('ok  ', m); };

function env(flag) {
  const mkEl = () => ({
    dataset: {}, attrs: {}, style: { setProperty() {} }, offsetWidth: 220, listeners: {}, disabled: false, hidden: false,
    classList: { s: new Set(), toggle(c, f) { f ? this.s.add(c) : this.s.delete(c); }, add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    click() { if (this.disabled) return; (this.listeners.click || []).forEach(f => f({})); },
    appendChild(c) { return c; }, querySelector() { return null; }, contains() { return false; }, focus() {},
    getBoundingClientRect() { return { left: 100, width: 60, top: 500 }; }
  });
  const host = mkEl(), button = mkEl();
  const built = [];
  const doc = {
    readyState: 'complete', documentElement: { clientWidth: 400, clientHeight: 800 },
    getElementById: id => id === 'frontPage' ? host : id === 'frontFormsButton' ? button : null,
    createElement(tag) { const e = mkEl(); if (tag === 'template') e.content = { firstChild: mkEl() }; built.push(e); return e; }, createTextNode: t => ({ t }),
    addEventListener() {}, body: mkEl(), head: mkEl()
  };
  const win = { document: doc, addEventListener() {}, requestAnimationFrame: f => f(), localStorage: { getItem: () => null, setItem() {} },
    MutationObserver: class { observe() {} }, setTimeout, clearTimeout, console, innerWidth: 400, innerHeight: 800 };
  if (flag !== undefined) win.__MMICJ_JOIN_ENABLED = flag;
  win.window = win; vm.createContext(win);
  vm.runInContext(SRC, win);
  return { win, button, built };
}

{
  const e = env(undefined);
  ok(e.button.disabled === false && !e.button.classList.contains('is-off'), 'flag not set: the button is normal');
  ok(e.button.attrs.title === 'Join or testify', 'flag not set: normal tooltip');
  e.button.click();
  ok(e.built.length > 0, 'flag not set: tapping opens the menu');
}
{
  const e = env(true);
  ok(e.button.disabled === false && !e.button.classList.contains('is-off'), 'flag true: the button is normal');
}
{
  const e = env(false);
  ok(e.button.disabled === true && e.button.classList.contains('is-off'), 'flag false: the button is disabled and marked dim');
  ok(e.button.attrs['aria-disabled'] === 'true' && /not available/i.test(e.button.attrs.title) && /not available/i.test(e.button.attrs['aria-label']), 'flag false: the tooltip and screen-reader label say it is not available');
  e.button.click();
  ok(e.built.length === 0, 'flag false: tapping builds no menu');
  e.win.FrontForms.open('join'); e.win.FrontForms.open('testify');
  ok(e.built.length === 0, 'flag false: FrontForms.open() opens no form either');
}
{
  const e = env('false');
  ok(e.button.disabled === false, 'only the real boolean false switches it off (a string is ignored)');
}
const css = fs.readFileSync(new URL('./css/front-forms.css', import.meta.url).pathname, 'utf8');
ok(/#frontFormsButton:disabled,\s*#frontFormsButton\.is-off\{[^}]*opacity:\.35/.test(css), 'css: the disabled button is dimmed');
ok(/#frontFormsButton:hover:not\(:disabled\)/.test(css), 'css: no hover lift while disabled');
console.log(fails ? '\n' + fails + ' FAILED' : '\nall ok');
process.exit(fails ? 1 : 0);
