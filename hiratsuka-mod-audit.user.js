// ==UserScript==
// @id             iitc-plugin-hiratsuka-mod-audit
// @name           IITC plugin: Hiratsuka MOD Audit
// @category       Info
// @version        0.1.0
// @description    Hiratsuka MOD audit copy helper
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper() {
  if (typeof window.plugin !== 'function') window.plugin = function() {};

  window.plugin.hiratsukaModAudit = function() {};
  var self = window.plugin.hiratsukaModAudit;

  self.classifyMod = function(mod) {
    if (!mod) return null;

    var name = (mod.name || mod.displayName || '').toLowerCase();
    var rarity = (mod.rarity || '').toLowerCase();

    if (name.indexOf('shield') >= 0) {
      if (rarity.indexOf('very') >= 0 || name.indexOf('very') >= 0) return 'VRSH';
      if (rarity.indexOf('rare') >= 0) return 'RSH';
      if (rarity.indexOf('common') >= 0) return 'CSH';
      return 'SH';
    }

    if (name.indexOf('turret') >= 0) return 'TURRET';
    if (name.indexOf('force') >= 0) return 'FA';
    if (name.indexOf('heat') >= 0) return 'HS';
    if (name.indexOf('multi') >= 0) return 'MH';

    return null;
  };

  self.analyzeMods = function(mods) {
    var result = {
      shield: [],
      turret: false,
      fa: false,
      hack: [],
      empty: 0,
      judge: '軽い'
    };

    for (var i = 0; i < 4; i++) {
      var mod = mods && mods[i] ? mods[i] : null;
      var c = self.classifyMod(mod);

      if (!c) {
        result.empty++;
        continue;
      }

      if (c.indexOf('SH') >= 0) result.shield.push(c);
      else if (c === 'TURRET') result.turret = true;
      else if (c === 'FA') result.fa = true;
      else if (c === 'HS' || c === 'MH') result.hack.push(c);
    }

    if (result.shield.length >= 2 || result.shield.indexOf('VRSH') >= 0) {
      result.judge = '硬い';
    }

    if (result.turret && result.fa) {
      result.judge = result.judge === '硬い' ? '硬い+反撃重い' : '反撃重い';
    } else if (result.turret || result.fa) {
      result.judge = result.judge === '硬い' ? '硬い+反撃あり' : '反撃あり';
    }

    return result;
  };

  self.portalLine = function(p) {
    var d = p.options.data || {};
    var m = self.analyzeMods(d.mods || []);

    var faction =
      d.team === 'E' ? 'ENL' :
      d.team === 'R' ? 'RES' :
      d.team || '-';

    return [
      d.title || '(no name)',
      faction,
      'L' + (d.level || '-'),
      (d.health || '-') + '%',
      m.shield.length ? m.shield.join(',') : '-',
      m.turret ? '有' : '-',
      m.fa ? '有' : '-',
      m.hack.length ? m.hack.join(',') : '-',
      m.empty,
      m.judge
    ].join(' / ');
  };

  self.buildLog = function() {
    var lines = [];

    lines.push('【平塚MOD監査ログ】');
    lines.push('形式：Portal / Faction / Lv / Health / Shield / Turret / FA / Hack / Empty / 判定');
    lines.push('');

    Object.keys(window.portals || {}).forEach(function(guid) {
      var p = window.portals[guid];
      if (!p || !p.options || !p.options.data) return;
      if (!map.getBounds().contains(p.getLatLng())) return;

      var d = p.options.data;
      if (!d.team || d.team === 'N') return;

      lines.push(self.portalLine(p));
    });

    return lines.join('\n');
  };

  self.copyLog = function() {
    var text = self.buildLog();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        alert('MOD監査ログをコピーしました');
      }).catch(function() {
        prompt('コピーしてください', text);
      });
    } else {
      prompt('コピーしてください', text);
    }
  };

  self.addButton = function() {
    if (document.getElementById('hiratsuka-mod-audit-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'hiratsuka-mod-audit-btn';
    btn.textContent = 'MOD監査';
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

    btn.onclick = self.copyLog;
    document.body.appendChild(btn);
  };

  self.setup = function() {
    self.addButton();
    console.log('Hiratsuka MOD Audit loaded');
  };

  var setup = self.setup;

  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded) setup();
}

var script = document.createElement('script');
script.appendChild(document.createTextNode('(' + wrapper + ')();'));
(document.body || document.head || document.documentElement).appendChild(script);
