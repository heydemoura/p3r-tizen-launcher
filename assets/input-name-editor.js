'use strict';
// Remote-only TVs can use the grid. A hardware keyboard or the native text field
// can edit the same draft, including pasted text and composed characters.
function makeInputNameEditor(save, play) {
  const form = document.getElementById('rename-input');
  const field = document.getElementById('input-alias');
  const keys = document.getElementById('rename-keys');
  const error = document.getElementById('rename-error');
  const letters = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const symbols = ['1234567890', '-_&+/@#.!', "(),:'?%"];
  let source = null, shift = false, numberPad = false;
  let rows = [], row = 0, col = 0, previousFocus = null;

  function close() {
    if (!source) return;
    source = null; form.hidden = true;
    if (form.contains(document.activeElement)) document.activeElement.blur();
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  }
  function commit() {
    const message = save(source, field.value);
    if (message) { error.textContent = message; return; }
    close(); play('confirm');
  }
  function insert(text) {
    let start = field.selectionStart, end = field.selectionEnd;
    if (text === null) {
      if (start === end && start > 0) start -= Array.from(field.value.slice(0, start)).pop().length;
      text = '';
    }
    if (field.value.length - (end - start) + text.length <= field.maxLength)
      field.setRangeText(text, start, end, 'end');
    error.textContent = '';
  }
  function activate(key) {
    if (key === 'save') { commit(); return; }
    if (key === 'cancel') { close(); play('back'); return; }
    if (key === 'case' || key === 'symbols') {
      if (key === 'case') { shift = !shift; numberPad = false; }
      else numberPad = !numberPad;
      buildKeys(); rows[row][col].focus();
    } else if (key === 'clear') { field.value = ''; }
    else insert(key === 'space' ? ' ' : key === 'delete' ? null : key);
    play('focus');
  }
  function buildKeys() {
    keys.replaceChildren();
    const layout = (numberPad ? symbols : letters).map(line =>
      Array.from(shift && !numberPad ? line.toUpperCase() : line, ch => [ch, ch]));
    layout.push([['case', shift ? 'abc' : 'ABC'], ['symbols', numberPad ? 'Letters' : '123'],
      ['space', 'Space'], ['delete', 'Delete'], ['clear', 'Clear'], ['cancel', 'Cancel'], ['save', 'Save']]);
    rows = layout.map((line, y) => {
      const strip = document.createElement('div');
      strip.className = y === layout.length - 1 ? 'key-row commands' : 'key-row';
      keys.appendChild(strip);
      return line.map(([key, label], x) => {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label; button.dataset.key = key;
        button.onfocus = () => { row = y; col = x; };
        button.onclick = () => activate(key);
        strip.appendChild(button);
        return button;
      });
    });
  }
  function open(input) {
    source = input; previousFocus = document.activeElement;
    numberPad = false; shift = false; error.textContent = '';
    document.getElementById('rename-port').textContent = input.port;
    field.placeholder = input.defaultName; field.value = input.name;
    form.hidden = false; buildKeys();
    field.setSelectionRange(0, field.value.length);
    if (typeof tizen === 'undefined') { field.focus(); field.select(); }
    else rows[0][0].focus();
  }
  function keydown(e) {
    const k = e.keyCode, fromField = e.target === field;
    if (e.isComposing) return;
    if (k === 10009 || k === 65385 || k === 27) {
      e.preventDefault(); close(); play('back'); return;
    }
    if (k === 13 || k === 65376) {
      e.preventDefault();
      if (e.repeat) return;
      if (fromField || k === 65376) commit();
      else activate(rows[row][col].dataset.key);
      return;
    }
    if (fromField && k !== 38 && k !== 40) return;
    if (k >= 37 && k <= 40) {
      e.preventDefault();
      if (fromField) { row = 0; col = 0; }
      else if (k === 37 || k === 39) col = (col + (k === 37 ? -1 : 1) + rows[row].length) % rows[row].length;
      else {
        const nextRow = (row + (k === 38 ? -1 : 1) + rows.length) % rows.length;
        col = Math.min(rows[nextRow].length - 1, Math.floor((col + .5) * rows[nextRow].length / rows[row].length));
        row = nextRow;
      }
      rows[row][col].focus(); play('focus');
    } else if (k === 8 || k === 46) {
      e.preventDefault(); insert(null); play('focus');
    } else if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key && [...e.key].length === 1) {
      e.preventDefault(); insert(e.key); field.focus();
    }
  }
  form.onsubmit = e => { e.preventDefault(); if (source) commit(); };
  return { open, close, keydown, isOpen: () => source !== null };
}
