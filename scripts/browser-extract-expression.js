(() => {
  const root = document.querySelector('#ddbChatText');
  if (!root) return JSON.stringify({ error: 'no #ddbChatText' });
  const turns = root.querySelectorAll(':scope > .ddbChat');
  const out = [];
  turns.forEach((turn, domIndex) => {
    const body = turn.querySelector('.ddbChatMessage');
    if (!body) return;
    let role;
    if (turn.classList.contains('ddbChat-User')) role = 'user';
    else if (turn.classList.contains('ddbChat-Duck')) role = 'assistant';
    else return;
    const rawId = body.id?.startsWith('id-') ? body.id.slice(3) : null;
    if (role === 'user') {
      const pre = body.querySelector('pre');
      out.push({
        role,
        id: rawId,
        text: (pre?.textContent ?? body.textContent ?? '').trimEnd(),
        domIndex,
      });
    } else {
      out.push({ role, id: rawId, html: body.innerHTML, domIndex });
    }
  });
  return JSON.stringify({ turnCount: out.length, raw: out });
})();