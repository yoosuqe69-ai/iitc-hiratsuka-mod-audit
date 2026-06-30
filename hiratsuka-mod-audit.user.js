// ==UserScript==
// @id             iitc-plugin-hiratsuka-mod-audit
// @name           IITC plugin: Hiratsuka MOD Audit
// @category       Info
// @version        0.5.0
// @description    Hiratsuka MOD audit semi-auto slow detail fetcher
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper() {
  if (typeof window.plugin !== 'function') window.plugin = function() {};

  window.plugin.hiratsukaModAudit = function() {};
  var self = window.plugin.hiratsukaModAudit;

  // ===== 設定 =====
  self.MIN_LEVEL = 6;          // L6以上
  self.TARGET_TEAM = 'E';      // ENLのみ。全勢力なら null
  self.MAX_TARGETS = 20;       // 1回の最大取得件数
  self.DELAY_MS = 5000;        // 1件ごとの待機時間 5秒

  self.queue = [];
  self.running = false;
  self.timer = null;
  self.results = {};

  self.classifyMod = function(mod) {
    if (!mod) return null;

    var name = (
      mod.name ||
      mod.displayName ||
      mod.type ||
      mod.itemType ||
      ''
    ).toLowerCase();

    var rarity = (
      mod.rarity ||
      mod.rarityString ||
      ''
    ).toLowerCase();

    if (name.indexOf('shield') >= 0) {
      if (rarity.indexOf('very') >= 0 || name.indexOf('very') >= 0 || name.indexOf('vr') >= 0) return 'VRSH';
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

  self.getDetail = function(guid, p) {
    var d = p && p.options ? p.options.data : null;

    if (d && Array.isArray(d.mods)) return d;

    if (window.portalDetail && typeof window.portalDetail.get === 'function') {
      var pd = window.portalDetail.get(guid);
      if (pd) return pd;
    }

    return d || {};
  };

  self.getMods = function(guid, p) {
    var detail = self.getDetail(guid, p);

    if (!detail) return undefined;
    if (Array.isArray(detail.mods)) return detail.mods;

    if (detail.portalV2 && Array.isArray(detail.portalV2.linkedModArray)) {
      return detail.portalV2.linkedModArray;
    }

    if (Array.isArray(detail.linkedModArray)) {
      return detail.linkedModArray;
    }

    return undefined;
  };

  self.analyzeMods = function(mods) {
    var result = {
      known: true,
      shield: [],
      turret: false,
      fa: false,
      hack: [],
      empty: 0,
      judge: '軽い'
    };

    if (!Array.isArray(mods)) {
      result.known = false;
      result.judge = 'MOD未取得';
      return result;
    }

    for (var i = 0; i < 4; i++) {
      var mod = mods[i] ? mods[i] : null;

      if (!mod) {
        result.empty++;
        continue;
      }

      var c = self.classifyMod(mod);

      if (!c) {
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

    if (
      result.shield.length === 0 &&
      !result.turret &&
      !result.fa &&
      result.hack.length === 0 &&
      result.empty === 4
    ) {
      result.judge = 'MODなし';
    }

    return result;
  };

  self.portalLine = function(guid, p) {
    var base = p.options.data || {};
    var detail = self.getDetail(guid, p);
    var mods = self.getMods(guid, p);
    var m = self.analyzeMods(mods);

    var d = detail || base;

    var title = base.title || d.title || '(no name)';
    var level = base.level || d.level || '-';
    var health = base.health || d.health || '-';
    var team = base.team || d.team || '-';

    var faction =
      team === 'E' ? 'ENL' :
      team === 'R' ? 'RES' :
      team || '-';

    if (!m.known) {
      return [
        title,
        faction,
        'L' + level,
        health + '%',
        'MOD未取得',
        '-',
        '-',
        '-',
        '-',
        '未取得'
      ].join(' / ');
    }

    return [
      title,
      faction,
      'L' + level,
      health + '%',
      m.shield.length ? m.shield.join(',') : '-',
      m.turret ? '有' : '-',
      m.fa ? '有' : '-',
      m.hack.length ? m.hack.join(',') : '-',
      m.empty,
      m.judge
    ].join(' / ');
  };

  self.getVisibleTargets = function() {
    var arr = [];

    Object.keys(window.portals || {}).forEach(function(guid) {
      var p = window.portals[guid];
      if (!p || !p.options || !p.options.data) return;
      if (!map.getBounds().contains(p.getLatLng())) return;

      var d = p.options.data;

      if (!d.team || d.team === 'N') return;
      if (self.TARGET_TEAM && d.team !== self.TARGET_TEAM) return;
      if ((d.level || 0) < self.MIN_LEVEL) return;

      arr.push({
        guid: guid,
        portal: p,
        level: d.level || 0,
        health: d.health || 0,
        title: d.title || ''
      });
    });

    arr.sort(function(a, b) {
      if (b.level !== a.level) return b.level - a.level;
      if (b.health !== a.health) return b.health - a.health;
      return a.title.localeCompare(b.title);
    });

    return arr.slice(0, self.MAX_TARGETS);
  };

  self.updateStatus = function(text) {
    var box = document.getElementById('hiratsuka-mod-audit-status');
    if (box) box.textContent = text;
  };

  self.requestDetail = function(guid) {
    try {
      if (window.portalDetail && typeof window.portalDetail.request === 'function') {
        window.portalDetail.request(guid);
        return true;
      }
    } catch (e) {
      console.log('portalDetail.request error', e);
    }
    return false;
  };

  self.markResult = function(item) {
    var p = item.portal;
    var mods = self.getMods(item.guid, p);
    var m = self.analyzeMods(mods);

    self.results[item.guid] = {
      guid: item.guid,
      portal: p,
      known: m.known,
      line: self.portalLine(item.guid, p)
    };
  };

  self.processNext = function() {
    if (!self.running) return;

    if (self.queue.length === 0) {
      self.running = false;
      self.updateStatus('MOD取得完了');
      alert('MOD詳細取得を終了しました');
      return;
    }

    var item = self.queue.shift();
    var title = item.title || '(no name)';

    self.updateStatus('取得中: ' + title + ' / 残り ' + self.queue.length);

    self.requestDetail(item.guid);

    self.timer = setTimeout(function() {
      self.markResult(item);
      self.processNext();
    }, self.DELAY_MS);
  };

  self.startFetch = function() {
    if (self.running) {
      alert('すでに取得中です');
      return;
    }

    var targets = self.getVisibleTargets();

    if (targets.length === 0) {
      alert('対象ポータルがありません。ズームインしてください。');
      return;
    }

    self.queue = targets.slice();
    self.results = {};
    self.running = true;

    alert(
      'MOD詳細取得を開始します\n' +
      '対象: ENL L' + self.MIN_LEVEL + '以上\n' +
      '最大: ' + self.MAX_TARGETS + '件\n' +
      '間隔: ' + (self.DELAY_MS / 1000) + '秒'
    );

    self.processNext();
  };

  self.stopFetch = function() {
    self.running = false;
    if (self.timer) clearTimeout(self.timer);
    self.queue = [];
    self.updateStatus('停止');
    alert('MOD取得を停止しました');
  };

  self.buildLog = function() {
    var lines = [];
    var visible = self.getVisibleTargets();

    var known = 0;
    var unknown = 0;

    lines.push('【平塚MOD監査ログ v0.5】');
    lines.push('方式：半自動・低速詳細取得');
    lines.push('条件：表示範囲内 / ENL / L' + self.MIN_LEVEL + '以上 / 最大' + self.MAX_TARGETS + '件');
    lines.push('形式：Portal / Faction / Lv / Health / Shield / Turret / FA / Hack / Empty / 判定');
    lines.push('');

    visible.forEach(function(item) {
      var line;

      if (self.results[item.guid]) {
        line = self.results[item.guid].line;
      } else {
        line = self.portalLine(item.guid, item.portal);
      }

      if (line.indexOf('MOD未取得') >= 0) unknown++;
      else known++;

      lines.push(line);
    });

    lines.unshift('取得済みMOD: ' + known + '件 / 未取得: ' + unknown + '件');
    lines.unshift('');

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

  self.addButton = function(id, text, bottom, handler) {
    if (document.getElementById(id)) return;

    var btn = document.createElement('button');
    btn.id = id;
    btn.textContent = text;
    btn.style.position = 'absolute';
    btn.style.right = '8px';
    btn.style.bottom = bottom + 'px';
    btn.style.zIndex = '9999';
    btn.style.padding = '6px 8px';
    btn.style.fontSize = '12px';
    btn.style.background = '#222';
    btn.style.color = '#fff';
    btn.style.border = '1px solid #888';
    btn.style.borderRadius = '4px';

    btn.onclick = handler;
    document.body.appendChild(btn);
  };

  self.addStatus = function() {
    if (document.getElementById('hiratsuka-mod-audit-status')) return;

    var box = document.createElement('div');
    box.id = 'hiratsuka-mod-audit-status';
    box.textContent = 'MOD監査 v0.5';
    box.style.position = 'absolute';
    box.style.right = '8px';
    box.style.bottom = '150px';
    box.style.zIndex = '9999';
    box.style.padding = '5px 7px';
    box.style.fontSize = '11px';
    box.style.background = 'rgba(0,0,0,0.75)';
    box.style.color = '#fff';
    box.style.border = '1px solid #666';
    box.style.borderRadius = '4px';
    box.style.maxWidth = '210px';

    document.body.appendChild(box);
  };

  self.setup = function() {
    self.addStatus();
    self.addButton('hiratsuka-mod-fetch-btn', 'MOD取得開始', 110, self.startFetch);
    self.addButton('hiratsuka-mod-stop-btn', '停止', 80, self.stopFetch);
    self.addButton('hiratsuka-mod-copy-btn', 'MODコピー', 50, self.copyLog);
    console.log('Hiratsuka MOD Audit v0.5 loaded');
  };

  var setup = self.setup;

  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded) setup();
}

var script = document.createElement('script');
script.appendChild(document.createTextNode('(' + wrapper + ')();'));
(document.body || document.head || document.documentElement).appendChild(script);
