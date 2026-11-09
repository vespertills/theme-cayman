(() => {
  const button = document.getElementById('theme-toggle');
  const diagrams = [];
  let renderVersion = 0;
  let renderId = 0;

  function diagramTheme(dark) {
    const light = {
      background: '#ffffff',
      primaryColor: '#f4f7f8',
      primaryTextColor: '#172b33',
      primaryBorderColor: '#506d77',
      lineColor: '#53656c',
      textColor: '#25373e',
      secondaryColor: '#e7eef0',
      tertiaryColor: '#f8fafb',
      mainBkg: '#f4f7f8',
      taskBkgColor: '#a9ccb5',
      taskTextColor: '#172b20',
      taskTextLightColor: '#172b20',
      taskTextOutsideColor: '#24363d',
      activeTaskBkgColor: '#76a889',
      activeTaskBorderColor: '#35694a',
      doneTaskBkgColor: '#c8ddce',
      critBkgColor: '#e5a0a0',
      critBorderColor: '#9f3e3e',
      gridColor: '#a6b5ba',
      sectionBkgColor: '#edf2f3',
      altSectionBkgColor: '#ffffff',
      sectionBkgColor2: '#e7eef0',
      sectionTitleColor: '#263a42',
      titleColor: '#1d3037',
      axisTextColor: '#293d45',
      todayLineColor: '#a63e3e'
    };
    const darkPalette = {
      background: '#182124',
      primaryColor: '#26383d',
      primaryTextColor: '#f1f6f5',
      primaryBorderColor: '#91b9ae',
      lineColor: '#bfd0cc',
      textColor: '#edf4f2',
      secondaryColor: '#2b3e43',
      tertiaryColor: '#202e32',
      mainBkg: '#26383d',
      taskBkgColor: '#426b55',
      taskTextColor: '#ffffff',
      taskTextLightColor: '#ffffff',
      taskTextOutsideColor: '#f1f6f5',
      activeTaskBkgColor: '#518567',
      activeTaskBorderColor: '#a8d2b7',
      doneTaskBkgColor: '#345543',
      critBkgColor: '#773f43',
      critBorderColor: '#e69a9e',
      gridColor: '#53656a',
      sectionBkgColor: '#27383c',
      altSectionBkgColor: '#1e2b2f',
      sectionBkgColor2: '#314348',
      sectionTitleColor: '#e4eeeb',
      titleColor: '#f1f6f5',
      axisTextColor: '#e1ebe8',
      todayLineColor: '#ff8d8d'
    };
    return dark ? darkPalette : light;
  }

  function initMermaid(dark, mindmap = false) {
    if (!window.mermaid) return;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark && mindmap ? 'dark' : 'base',
      themeVariables: dark && mindmap ? { ...diagramTheme(true), background: '#17242a', primaryColor: '#2b404a', primaryTextColor: '#f4fafb', textColor: '#eaf5f5' } : diagramTheme(dark)
    });
  }

  async function renderDiagrams() {
    if (!window.mermaid || diagrams.length === 0) return;
    const version = ++renderVersion;
    const dark = document.body.classList.contains('dark');
    initMermaid(dark);

    for (const diagram of diagrams) {
      if (version !== renderVersion) return;
      const source = diagram.dataset.mermaidSource || diagram.textContent || '';
      const mindmap = /^\s*mindmap\b/.test(source);
      diagram.classList.toggle('mermaid-mindmap', mindmap);
      initMermaid(dark, mindmap);
      if (/^\s*gantt\b/.test(source)) {
        diagram.classList.add('mermaid-gantt');
      }
      try {
        const result = await mermaid.render(`cayman-mermaid-${++renderId}`, source);
        if (version !== renderVersion) return;
        diagram.classList.remove('diagram-error');
        diagram.replaceChildren();
        diagram.insertAdjacentHTML('afterbegin', result.svg);
        if (result.bindFunctions) result.bindFunctions(diagram);
      } catch (error) {
        if (version !== renderVersion) return;
        diagram.classList.add('diagram-error');
        diagram.setAttribute('role', 'region');
        diagram.setAttribute('aria-label', 'Mermaid diagram could not be rendered');
        const message = document.createElement('p');
        message.className = 'diagram-error-message';
        message.textContent = `Diagram error: ${error?.message || 'unknown Mermaid error'}`;
        const code = document.createElement('pre');
        code.className = 'diagram-source';
        code.textContent = source;
        diagram.replaceChildren(message, code);
        console.error('Mermaid render failed for one diagram:', error);
      }
    }
  }

  function setTheme(dark) {
    document.body.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    if (button) {
      button.textContent = dark ? '☀ Light mode' : '◐ Dark mode';
      button.setAttribute('aria-pressed', String(dark));
    }
    try {
      localStorage.setItem('cayman-theme', dark ? 'dark' : 'light');
    } catch (error) {
      // Theme switching still works when browser storage is unavailable.
    }
    renderDiagrams();
  }

  let saved = 'light';
  try {
    saved = localStorage.getItem('cayman-theme') || 'light';
  } catch (error) {
    // Use the light theme when browser storage is unavailable.
  }
  document.body.classList.toggle('dark', saved === 'dark');
  document.documentElement.style.colorScheme = saved === 'dark' ? 'dark' : 'light';
  if (button) {
    button.textContent = saved === 'dark' ? '☀ Light mode' : '◐ Dark mode';
    button.setAttribute('aria-pressed', String(saved === 'dark'));
    button.addEventListener('click', () => setTheme(!document.body.classList.contains('dark')));
  }

  // Support both Hugo's Mermaid render hook and Pandoc's static preview output.
  for (const pre of document.querySelectorAll('pre')) {
    const code = pre.querySelector('code.language-mermaid, code.sourceCode.mermaid, code[data-lang="mermaid"]');
    if (!pre.classList.contains('mermaid') && !code) continue;
    const box = document.createElement('div');
    box.className = 'mermaid';
    box.dataset.mermaidSource = (code || pre).textContent || '';
    pre.replaceWith(box);
  }
  for (const diagram of document.querySelectorAll('.mermaid')) {
    if (!diagram.dataset.mermaidSource) diagram.dataset.mermaidSource = diagram.textContent || '';
    diagrams.push(diagram);
  }

  for (const pre of document.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    if (!code || pre.classList.contains('mermaid')) continue;
    const name = code.dataset.lang || [...code.classList].find(c => c.startsWith('language-'))?.slice(9) || 'code';
    const header = document.createElement('div'); header.className = 'code-language'; header.textContent = name;
    const frame = document.createElement('div'); frame.className = 'code-frame';
    pre.replaceWith(frame); frame.append(header, pre);
  }
  for (const tabs of document.querySelectorAll('.demo-tabs')) {
    tabs.querySelectorAll('[role="tab"]').forEach(tab => tab.addEventListener('click', () => {
      tabs.querySelectorAll('[role="tab"]').forEach(button => button.setAttribute('aria-selected', String(button === tab)));
      tabs.querySelectorAll('[role="tabpanel"]').forEach(panel => { panel.hidden = panel.id !== tab.dataset.panel; });
    }));
  }
  initMermaid(saved === 'dark');
  renderDiagrams();
  if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise();
})();
