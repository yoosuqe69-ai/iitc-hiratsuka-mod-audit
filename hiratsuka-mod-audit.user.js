// ==UserScript==
// @id             iitc-plugin-hiratsuka-mod-audit
// @name           IITC plugin: Hiratsuka MOD Audit Diagnostic
// @category       Info
// @version        0.4.0
// @description    Diagnostic tool for finding MOD data location
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper() {
  if (typeof window.plugin !== 'function') window.plugin = function() {};

  window.plugin.hiratsukaModAudit = function() {};
  var self = window.plugin.hiratsukaModAudit;

  self.safeStringify = function(obj) {
    var seen = [];
    return JSON.stringify(obj, function(key, value) {
      if (typeof value === 'object' && value !== null) {
        if (seen.indexOf(value) >= 0) return '[Circular]';
        seen.push(value);
      }
      if (typeof value === 'function') return '[Function]';
      return value;
    }, 2);
  };

  self.pick = function(obj, keys) {
    var out = {};
    if (!obj) return out;

    keys.forEach(function(k) {
      try {
        out[k] = obj[k];
      } catch (e) {
        out[k] = '[Error reading]';
      }
    });

    return out;
  };

  self.findSelectedGuid = function() {
    if (window.selectedPortal) return window.selectedPortal;
    if (window.selectedPortalGuid) return window.selectedPortalGuid;
    if (window.portalSelected) return window.portalSelected;
    return null;
  };

  self.buildDiagnostic = function() {
    var guid = self.findSelectedGuid();
    var lines = [];

    lines.push('【平塚MOD診断ログ v0.4】');
    lines.push('目的：選択中ポータルのMOD保存場所を特定');
    lines.push('');

    lines.push('selected guid: ' + guid);
    lines.push('');

    if (!guid) {
      lines.push('ERROR: selected portal guid not found');
      lines.push('ポータルを1つタップしてから、もう一度MOD診断を押してください。');
      return lines.join('\n');
    }

    var p = window.portals && window.portals[guid] ? window.portals[guid] : null;

    lines.push('--- window.portals[guid] exists ---');
    lines.push(String(!!p));
    lines.push('');

    if (p && p.options && p.options.data) {
      lines.push('--- p.options.data keys ---');
      lines.push(Object.keys(p.options.data).join(', '));
      lines.push('');

      lines.push('--- p.options.data important ---');
      lines.push(self.safeStringify(self.pick(p.options.data, [
        'title',
        'team',
        'level',
        'health',
        'mods',
        'resonators',
        'details',
        'portalV2',
        'linkedModArray'
      ])));
      lines.push('');
    }

    lines.push('--- window.portalDetail type ---');
    lines.push(typeof window.portalDetail);
    lines.push('');

    if (window.portalDetail) {
      lines.push('--- window.portalDetail keys ---');
      try {
        lines.push(Object.keys(window.portalDetail).slice(0, 50).join(', '));
      } catch (e) {
        lines.push('cannot list keys');
      }
      lines.push('');

      if (typeof window.portalDetail.get === 'function') {
        var pdGet = window.portalDetail.get(guid);
        lines.push('--- window.portalDetail.get(guid) ---');
        lines.push(self.safeStringify(pdGet));
        lines.push('');
      }

      if (window.portalDetail[guid]) {
        lines.push('--- window.portalDetail[guid] ---');
        lines.push(self.safeStringify(window.portalDetail[guid]));
        lines.push('');
      }
    }

    lines.push('--- window.portalDetails type ---');
    lines.push(typeof window.portalDetails);
    lines.push('');

    if (window.portalDetails) {
      lines.push('--- window.portalDetails keys sample ---');
      try {
        lines.push(Object.keys(window.portalDetails).slice(0, 20).join(', '));
      } catch (e) {
        lines.push('cannot list keys');
      }
      lines.push('');

      if (window.portalDetails[guid]) {
        lines.push('--- window.portalDetails[guid] ---');
        lines.push(self.safeStringify(window.portalDetails[guid]));
        lines.push('');
      }
    }

    lines.push('--- window.plugin keys containing detail/mod ---');
    try {
      var pluginKeys = Object.keys(window.plugin || {}).filter(function(k) {
        return k.toLowerCase().indexOf('mod') >= 0 ||
               k.toLowerCase().indexOf('detail') >= 0 ||
               k.toLowerCase().indexOf('portal') >= 0;
      });
      lines.push(pluginKeys.join(', '));
    } catch (e) {
      lines.push('cannot list plugin keys');
    }
    lines.push('');

    lines.push('--- selected portal object short ---');
    if (p) {
      lines.push(self.safeStringify({
        guid: guid,
        title: p.options && p.options.data ? p.options.data.title : null,
        team: p.options && p.options.data ? p.options.data.team : null,
        level: p.options && p.options.data ? p.options.data.level : null,
        health: p.options && p.options.data ? p.options.data.health : null
      }));
    }

    return lines.join('\n');
  };

  self.copyDiagnostic = function() {
    var text = self.buildDiagnostic();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        alert('MOD診断ログをコピーしました');
      }).catch(function() {
        prompt('コピーしてください', text);
      });
    } else {
      prompt('コピーしてください', text);
    }
  };

  self.addButton = function() {
    if (document.getElementById('hiratsuka-mod-diagnostic-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'hiratsuka-mod-diagnostic-btn';
    btn.textContent = 'MOD診断';
    btn.style.position = 'absolute';
    btn.style.right = '8px';
    btn.style.bottom = '55px';
    btn.style.zIndex = '9999';
    btn.style.padding = '6px 8px';
    btn.style.fontSize = '12px';
    btn.style.background = '#222';
    btn.style.color = '#fff';
    btn.style.border = '1px solid #888';
    btn.style.borderRadius = '4px';

    btn.onclick = self.copyDiagnostic;
    document.body.appendChild(btn);
  };

  self.setup = function() {
    self.addButton();
    console.log('Hiratsuka MOD Audit Diagnostic v0.4 loaded');
  };

  var setup = self.setup;

  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded) setup();
}

var script = document.createElement('script');
script.appendChild(document.createTextNode('(' + wrapper + ')();'));
(document.body || document.head || document.documentElement).appendChild(script);
