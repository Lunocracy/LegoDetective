var LunoLoader = globalThis.LunoLoader = class LunoLoader {
  constructor() {}

  static loadedScripts = new Set([
    'LunoLoader.js',
    '/app/LunoLoader.js',
    './app/LunoLoader.js',
    '/Luno/app/LunoLoader.js',
    'Luno/app/LunoLoader.js',
    '/Library/LunoLoader.js',
    './Library/LunoLoader.js',
    './library/LunoLoader.js',
    'Library/LunoLoader.js',
    'library/LunoLoader.js'
  ]);
  static loadedStyles = new Set();

  static isStaticHosting() {
    try {
      if (typeof window !== 'undefined' && window.location) {
        var host = window.location.hostname || '';
        return host.endsWith('github.io') || host.endsWith('pages.dev') || window.location.protocol === 'file:';
      }
    } catch (e) {}
    return false;
  }

  static getLibraryRoot() {
    if (LunoLoader.isStaticHosting()) {
      return './library/';
    }
    return '/Library/';
  }

  static loadStyle(cssPath) {
    return new Promise(function(resolve, reject) {
      var isStatic = LunoLoader.isStaticHosting();
      var fullUrl = cssPath;
      if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        fullUrl = isStatic ? (cssPath.startsWith('/') ? ('.' + cssPath) : cssPath) : (cssPath.startsWith('/') ? cssPath : ('/' + cssPath));
      }
      if (LunoLoader.loadedStyles.has(fullUrl)) return resolve({ url: fullUrl, cached: true });

      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = fullUrl + (fullUrl.indexOf('?') === -1 ? '?v=' : '&v=') + Date.now();
      link.onload = function() { LunoLoader.loadedStyles.add(fullUrl); resolve({ url: fullUrl, cached: false }); };
      link.onerror = function() { reject(new Error('Failed to load stylesheet: ' + cssPath)); };
      document.head.appendChild(link);
    });
  }

  static loadScript(jsPath) {
    return new Promise(function(resolve, reject) {
      var isStatic = LunoLoader.isStaticHosting();
      var fullUrl = jsPath;
      if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        fullUrl = isStatic ? (jsPath.startsWith('/') ? ('.' + jsPath) : jsPath) : (jsPath.startsWith('/') ? jsPath : ('/' + jsPath));
      }

      var cleanName = jsPath.split('?')[0].split('/').pop();
      if (cleanName === 'LunoLoader.js' && typeof globalThis.LunoLoader !== 'undefined') {
        LunoLoader.loadedScripts.add(fullUrl);
        return resolve({ url: fullUrl, cached: true });
      }

      if (LunoLoader.loadedScripts.has(fullUrl) || LunoLoader.loadedScripts.has(jsPath)) {
        return resolve({ url: fullUrl, cached: true });
      }

      var script = document.createElement('script');
      script.src = fullUrl + (fullUrl.indexOf('?') === -1 ? '?v=' : '&v=') + Date.now();
      script.async = false;
      script.onload = function() {
        LunoLoader.loadedScripts.add(fullUrl);
        LunoLoader.loadedScripts.add(jsPath);
        resolve({ url: fullUrl, cached: false });
      };
      script.onerror = function() {
        reject(new Error('Failed to load script: ' + jsPath));
      };
      document.head.appendChild(script);
    });
  }

  static async applyPatchLog(projectName) {
    if (LunoLoader.isStaticHosting()) {
      return { appliedCount: 0, note: 'Static hosting mode' };
    }

    try {
      var targetProj = projectName || 'Luno';
      var res = await fetch('/api/fs/read?path=LunoPatchLog.html&project=' + encodeURIComponent(targetProj) + '&v=' + Date.now());
      var data = await res.json();
      if (!res.ok || !data || !data.content || !data.content.trim()) return;

      var parser = globalThis.LunoPayloadParser || globalThis.LunoContainerParser;
      if (!parser || typeof parser.parsePatchLog !== 'function') return;

      var parsed = parser.parsePatchLog(data.content);
      var files = parsed.files || [];

      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f || !f.filePath) continue;

        var norm = f.filePath.replace(/\\/g, '/').replace(/^\/+/, '');
        var isForTarget = (targetProj === 'Luno') 
          ? (norm.startsWith('Luno/') || !norm.includes('/') || norm.startsWith('app/') || norm.startsWith('browser/') || norm.startsWith('core/') || norm.startsWith('docs/') || norm.startsWith('test/'))
          : (norm.startsWith(targetProj + '/') || norm.startsWith('Library/'));

        if (!isForTarget) continue;

        if (f.methodSpec && f.content) {
          var spec = f.methodSpec.replace(/^(?:globalThis|window)\./, '').trim();
          var isProto = spec.includes('.prototype.');
          var className = '';
          var memberName = '';

          if (isProto) {
            var pParts = spec.split('.prototype.');
            className = pParts[0].trim();
            memberName = pParts[1].trim();
          } else if (spec.includes('.')) {
            var dParts = spec.split('.');
            memberName = dParts.pop().trim();
            className = dParts.join('.').trim();
          } else {
            memberName = spec;
          }

          var fnCode = f.content.trim();
          if (fnCode.endsWith(';')) fnCode = fnCode.slice(0, -1).trim();

          var braceIdx = fnCode.indexOf('{');
          var headerSig = braceIdx !== -1 ? fnCode.slice(0, braceIdx) : fnCode;
          var isAsync = /\basync\b/.test(headerSig) || fnCode.includes('await ');

          var cleanBody = fnCode.replace(/^(?:static\s+)?(?:async\s+)?/, '');
          var parenIdx = cleanBody.indexOf('(');
          var paramsAndBody = (parenIdx !== -1) ? cleanBody.slice(parenIdx) : ('() ' + cleanBody);

          var fnExpr = (isAsync ? 'async function' : 'function') + paramsAndBody;
          var targetObj = isProto ? (globalThis[className] && globalThis[className].prototype) : globalThis[className];
          if (targetObj) {
            try {
              var evalFn = new Function('return (' + fnExpr + ');')();
              targetObj[memberName] = evalFn;
            } catch(e) {}
          }
        }
      }
    } catch(err) {}
  }

  static async loadApp(containerId) {
    var targetContainer = typeof containerId === 'string'
      ? document.getElementById(containerId)
      : (containerId || document.getElementById('app-root') || document.body);

    try {
      var lunoMeta = {};
      try {
        var res = await fetch('luno.json?v=' + Date.now());
        if (res.ok) lunoMeta = await res.json();
      } catch(e){}

      var libRoot = LunoLoader.getLibraryRoot();
      var libs = Array.isArray(lunoMeta.library) ? lunoMeta.library : [];
      var main = Array.isArray(lunoMeta.main) ? lunoMeta.main : [];
      var styles = Array.isArray(lunoMeta.styles) ? lunoMeta.styles : [];

      for (var s = 0; s < styles.length; s++) {
        try { await LunoLoader.loadStyle(styles[s]); } catch(e){}
      }

      for (var l = 0; l < libs.length; l++) {
        var cleanLib = libs[l].replace(/^Library\//i, '').replace(/^library\//i, '').replace(/^\/+/, '');
        try { await LunoLoader.loadScript(libRoot + cleanLib); } catch(e){}
      }

      if (typeof DomBasics !== 'undefined' && typeof DomBasics.run === 'function') {
        DomBasics.run();
      }

      // Auto-load Three.js if ThreeJSLoader was requested and THREE is not yet ready
      if (typeof ThreeJSLoader !== 'undefined' && typeof ThreeJSLoader.load === 'function' && typeof THREE === 'undefined') {
        try {
          await ThreeJSLoader.load();
        } catch(threeErr) {
          console.warn('[LunoLoader] Three.js dynamic load notice:', threeErr.message);
        }
      }

      for (var m = 0; m < main.length; m++) {
        try { await LunoLoader.loadScript(main[m]); } catch(e){}
      }

      try {
        await LunoLoader.applyPatchLog(lunoMeta.name || 'Luno');
      } catch(e){}

      var entryClass = (lunoMeta.entrypoint && lunoMeta.entrypoint.class) || lunoMeta.mainClass;
      var entryMethod = (lunoMeta.entrypoint && lunoMeta.entrypoint.method) || 'run';

      if (entryClass && typeof window[entryClass] === 'function') {
        var AppCls = window[entryClass];
        var envCtx = { container: targetContainer, config: lunoMeta, isStatic: LunoLoader.isStaticHosting() };
        if (typeof AppCls[entryMethod] === 'function') {
          await AppCls[entryMethod](envCtx);
        } else {
          var inst = new AppCls();
          if (typeof inst[entryMethod] === 'function') await inst[entryMethod](envCtx);
          else if (typeof inst.run === 'function') await inst.run(envCtx);
        }
      } else if (entryClass) {
        throw new Error('Entrypoint class "' + entryClass + '" is not available on window scope.');
      }
    } catch (err) {
      console.error('[LunoLoader Failure]', err);
      if (targetContainer) {
        var errBox = document.createElement('div');
        errBox.style.cssText = 'padding:1.25rem; background:#1c080a; border:2px solid #ff7b72; border-radius:10px; color:#ff7b72; font-family:monospace; margin:1rem; box-shadow:0 8px 32px rgba(0,0,0,0.8);';
        
        var reportText = '⚠️ Application Loader Error:\n' +
          'Message: ' + err.message + '\n' +
          (err.stack ? ('Stack:\n' + err.stack + '\n') : '') +
          'URL: ' + location.href + '\n' +
          'Time: ' + new Date().toISOString();

        errBox.innerHTML = '<h3 style="margin-top:0; color:#ff7b72;">⚠️ Application Boot Failure</h3>' +
          '<p style="font-size:12px; color:#c9d1d9; margin-bottom:8px;">' + err.message + '</p>' +
          '<pre style="font-size:10px; color:#8b949e; background:#0d1117; padding:8px; border-radius:6px; white-space:pre-wrap; max-height:160px; overflow-y:auto;">' + (err.stack || err.message) + '</pre>' +
          '<button id="btn-copy-loader-err" style="margin-top:8px; padding:8px 16px; background:#238636; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer; font-family:monospace; font-size:12px;">📋 Copy Error Details</button>';
        
        targetContainer.innerHTML = '';
        targetContainer.appendChild(errBox);

        setTimeout(function() {
          var btn = document.getElementById('btn-copy-loader-err');
          if (btn) {
            btn.onclick = function() {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(reportText).then(function() {
                  btn.textContent = '✓ Copied to Clipboard!';
                  setTimeout(function() { btn.textContent = '📋 Copy Error Details'; }, 2000);
                });
              } else {
                prompt('Copy error report:', reportText);
              }
            };
          }
        }, 50);
      }
    }
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = LunoLoader;