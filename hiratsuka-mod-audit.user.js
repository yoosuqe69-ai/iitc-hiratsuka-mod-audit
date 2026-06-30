// ==UserScript==
// @id             iitc-plugin-hiratsuka-mod-audit
// @name           IITC plugin: Hiratsuka MOD Portal List
// @category       Info
// @version        0.6.2
// @description    Hiratsuka MOD audit compact UI
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper() {
  if (typeof window.plugin !== 'function') window.plugin = function() {};

  window.plugin.hiratsukaModAudit = function() {};
  var self = window.plugin.hiratsukaModAudit;

  self.MIN_LEVEL = 6;
  self.TARGET_TEAM = 'E';
  self.MAX_TARGETS = 20;
  self.DELAY_MS = 5000;

  self.queue = [];
  self.running = false;
  self.timer = null;
  self.sortMode = 'weak';

  self.classifyMod = function(mod) {
    if (!mod) return null;

    var name = (mod.name || mod.displayName || mod.type || mod.itemType || '').toLowerCase();
    var rarity = (mod.rarity || mod.rarityString || '').toLowerCase();

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
      judge: '軽い',
      weakScore: 0,
      hardScore: 0,
      weakLabel: '不明'
    };

    if (!Array.isArray(mods)) {
      result.known = false;
      result.judge = 'MOD未取得';
      result.weakLabel = '未取得';
      return result;
    }

    for (var i = 0; i < 4; i++) {
      var mod = mods[i] ? mods[i] : null;

      if (!mod) {
        result.empty++;
        continue;
      }

      var c = self.classifyMod(mod);
      if (!c) continue;

      if (c.indexOf('SH') >= 0) result.shield.push(c);
      else if (c === 'TURRET') result.turret = true;
      else if (c === 'FA') result.fa = true;
      else if (c === 'HS' || c === 'MH') result.hack.push(c);
    }

    var vr = result.shield.filter(function(x) { return x === 'VRSH'; }).length;
    var rare = result.shield.filter(function(x) { return x === 'RSH'; }).length;
    var common = result.shield.filter(function(x) { return x === 'CSH'; }).length;

    result.hardScore += vr * 4;
    result.hardScore += rare * 3;
    result.hardScore += common * 1;
    if (result.turret) result.hardScore += 4;
    if (result.fa) result.hardScore += 4;

    result.weakScore += result.empty * 2;
    if (vr === 0) result.weakScore += 3;
    if (!result.turret && !result.fa) result.weakScore += 4;
    if (result.shield.length <= 2) result.weakScore += 2;
    if (result.shield.length >= 3) result.weakScore -= 2;
    if (vr >= 2) result.weakScore -= 5;
    if (result.turret) result.weakScore -= 3;
    if (result.fa) result.weakScore -= 3;

    if (result.shield.length >= 2 || vr >= 1) {
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

    if (result.weakScore >= 7) result.weakLabel = '脆弱A';
    else if (result.weakScore >= 4) result.weakLabel = '脆弱B';
    else if (result.weakScore >= 1) result.weakLabel = '脆弱C';
    else result.weakLabel = '堅牢';

    return result;
  };

  self.getPortalRecord = function(guid, p) {
    var base = p.options.data || {};
    var detail = self.getDetail(guid, p);
    var mods = self.getMods(guid, p);
    var m = self.analyzeMods(mods);
    var d = detail || base;

    var team = base.team || d.team || '-';
    var faction =
      team === 'E' ? 'ENL' :
      team === 'R' ? 'RES' :
      team || '-';

    return {
      guid: guid,
      portal: p,
      title: base.title || d.title || '(no name)',
      faction: faction,
      team: team,
      level: base.level || d.level || 0,
      health: base.health || d.health || 0,
      shield: m.known ? (m.shield.length ? m.shield.join(',') : '-') : 'MOD未取得',
      turret: m.known ? (m.turret ? '有' : '-') : '-',
      fa: m.known ? (m.fa ? '有' : '-') : '-',
      hack: m.known ? (m.hack.length ? m.hack.join(',') : '-') : '-',
      empty: m.known ? m.empty : '-',
      judge: m.known ? m.judge : '未取得',
      known: m.known,
      weakScore: m.weakScore,
      hardScore: m.hardScore,
      weakLabel: m.weakLabel
    };
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

  self.getRecords = function() {
    var targets = self.getVisibleTargets();
    var records = targets.map(function(item) {
      return self.getPortalRecord(item.guid, item.portal);
    });

    records.sort(function(a, b) {
      if (self.sortMode === 'weak') {
        if (b.weakScore !== a.weakScore) return b.weakScore - a.weakScore;
        return a.level - b.level;
      }

      if (self.sortMode === 'hard') {
        if (b.hardScore !== a.hardScore) return b.hardScore - a.hardScore;
        return b.level - a.level;
      }

      if (self.sortMode === 'react') {
        var ar = (a.turret === '有' ? 1 : 0) + (a.fa === '有' ? 1 : 0);
        var br = (b.turret === '有' ? 1 : 0) + (b.fa === '有' ? 1 : 0);
        if (br !== ar) return br - ar;
        return b.hardScore - a.hardScore;
      }

      return b.level - a.level;
    });

    return records;
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

  self.processNext = function() {
    if (!self.running) return;

    if (self.queue.length === 0) {
      self.running = false;
      self.updateStatus('完了');
      self.renderPanel();
      alert('MOD詳細取得を終了しました');
      return;
    }

    var item = self.queue.shift();
    self.updateStatus('取得中 ' + (self.MAX_TARGETS - self.queue.length) + '/' + self.MAX_TARGETS);

    self.requestDetail(item.guid);

    self.timer = setTimeout(function() {
      self.renderPanel();
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
    self.renderPanel();
    alert('MOD取得を停止しました');
  };

  self.setSort = function(mode) {
    self.sortMode = mode;
    self.renderPanel();
  };

  self.lineFromRecord = function(r) {
    return [
      r.title,
      r.faction,
      'L' + r.level,
      r.health + '%',
      r.shield,
      r.turret,
      r.fa,
      r.hack,
      r.empty,
      r.judge,
      r.weakLabel
    ].join(' / ');
  };

  self.buildLog = function() {
    var records = self.getRecords();
    var known = records.filter(function(r) { return r.known; }).length;
    var unknown = records.length - known;

    var lines = [];

    lines.push('');
    lines.push('取得済みMOD: ' + known + '件 / 未取得: ' + unknown + '件');
    lines.push('【平塚MOD Portal List v0.6.2】');
    lines.push('方式：Portal List統合 / コンパクトUI / 半自動低速取得 / ソート=' + self.sortMode);
    lines.push('条件：表示範囲内 / ENL / L' + self.MIN_LEVEL + '以上 / 最大' + self.MAX_TARGETS + '件');
    lines.push('形式：Portal / Faction / Lv / Health / Shield / Turret / FA / Hack / Empty / 判定 / 脆弱度');
    lines.push('');

    records.forEach(function(r) {
      lines.push(self.lineFromRecord(r));
    });

    return lines.join('\n');
  };

  self.copyLog = function() {
    var text = self.buildLog();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() {
        alert('MOD Portal Listをコピーしました');
      }).catch(function() {
        prompt('コピーしてください', text);
      });
    } else {
      prompt('コピーしてください', text);
    }
  };

  self.closePanel = function() {
    var panel = document.getElementById('hiratsuka-mod-panel');
    if (panel) panel.style.display = 'none';
  };

  self.renderPanel = function() {
    var panel = document.getElementById('hiratsuka-mod-panel');
    if (!panel) return;

    var records = self.getRecords();
    var known = records.filter(function(r) { return r.known; }).length;

    var html = '';
    html += '<div style="font-weight:bold;margin-bottom:4px;">';
    html += '平塚MOD List v0.6.2';
    html += '<button id="hiratsuka-mod-panel-close" style="float:right;background:#333;color:#fff;border:1px solid #aaa;border-radius:3px;">×</button>';
    html += '</div>';
    html += '<div>取得 ' + known + '/' + records.length + '　並び:' + self.sortMode + '</div>';
    html += '<table style="width:100%;border-collapse:collapse;margin-top:4px;">';
    html += '<tr>';
    html += '<th style="text-align:left;">Portal</th>';
    html += '<th>Lv</th>';
    html += '<th>盾</th>';
    html += '<th>T</th>';
    html += '<th>FA</th>';
    html += '<th>判定</th>';
    html += '</tr>';

    records.forEach(function(r) {
      html += '<tr style="border-top:1px solid #555;">';
      html += '<td style="max-width:120px;overflow:hidden;white-space:nowrap;">' + r.title + '</td>';
      html += '<td>L' + r.level + '</td>';
      html += '<td>' + r.shield + '</td>';
      html += '<td>' + r.turret + '</td>';
      html += '<td>' + r.fa + '</td>';
      html += '<td>' + r.weakLabel + '</td>';
      html += '</tr>';
    });

    html += '</table>';
    panel.innerHTML = html;

    var closeBtn = document.getElementById('hiratsuka-mod-panel-close');
    if (closeBtn) closeBtn.onclick = self.closePanel;
  };

  self.togglePanel = function() {
    var panel = document.getElementById('hiratsuka-mod-panel');

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'hiratsuka-mod-panel';
      panel.style.position = 'absolute';
      panel.style.left = '8px';
      panel.style.bottom = '50px';
      panel.style.zIndex = '9998';
      panel.style.width = '78%';
      panel.style.maxHeight = '42%';
      panel.style.overflow = 'auto';
      panel.style.background = 'rgba(0,0,0,0.88)';
      panel.style.color = '#fff';
      panel.style.fontSize = '11px';
      panel.style.padding = '8px';
      panel.style.border = '1px solid #777';
      panel.style.borderRadius = '4px';
      document.body.appendChild(panel);
      self.renderPanel();
      return;
    }

    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      self.renderPanel();
    } else {
      panel.style.display = 'none';
    }
  };

  self.toggleMenu = function() {
    var menu = document.getElementById('hiratsuka-mod-menu');

    if (!menu) return;

    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  };

  self.addButton = function(parent, text, handler) {
    var btn = document.createElement('button');
    btn.textContent = text;
    btn.style.display = 'block';
    btn.style.width = '100%';
    btn.style.margin = '3px 0';
    btn.style.padding = '6px 8px';
    btn.style.fontSize = '12px';
    btn.style.background = '#222';
    btn.style.color = '#fff';
    btn.style.border = '1px solid #888';
    btn.style.borderRadius = '4px';
    btn.onclick = handler;
    parent.appendChild(btn);
  };

  self.addCompactUI = function() {
    if (document.getElementById('hiratsuka-mod-main-btn')) return;

    var main = document.createElement('button');
    main.id = 'hiratsuka-mod-main-btn';
    main.textContent = 'MOD';
    main.style.position = 'absolute';
    main.style.right = '8px';
    main.style.bottom = '45px';
    main.style.zIndex = '10000';
    main.style.padding = '8px 12px';
    main.style.fontSize = '13px';
    main.style.background = '#222';
    main.style.color = '#fff';
    main.style.border = '1px solid #aaa';
    main.style.borderRadius = '5px';
    main.onclick = self.toggleMenu;
    document.body.appendChild(main);

    var menu = document.createElement('div');
    menu.id = 'hiratsuka-mod-menu';
    menu.style.position = 'absolute';
    menu.style.right = '8px';
    menu.style.bottom = '86px';
    menu.style.zIndex = '10000';
    menu.style.width = '98px';
    menu.style.padding = '5px';
    menu.style.background = 'rgba(0,0,0,0.85)';
    menu.style.border = '1px solid #777';
    menu.style.borderRadius = '5px';
    menu.style.display = 'none';

    self.addButton(menu, '取得', self.startFetch);
    self.addButton(menu, '停止', self.stopFetch);
    self.addButton(menu, 'コピー', self.copyLog);
    self.addButton(menu, '一覧', self.togglePanel);
    self.addButton(menu, '脆弱', function() { self.setSort('weak'); });
    self.addButton(menu, '硬い', function() { self.setSort('hard'); });
    self.addButton(menu, '反撃', function() { self.setSort('react'); });
    self.addButton(menu, '閉じる', function() { menu.style.display = 'none'; });

    document.body.appendChild(menu);

    var status = document.createElement('div');
    status.id = 'hiratsuka-mod-audit-status';
    status.textContent = 'MOD v0.6.2';
    status.style.position = 'absolute';
    status.style.right = '8px';
    status.style.bottom = '89px';
    status.style.zIndex = '9999';
    status.style.padding = '4px 6px';
    status.style.fontSize = '10px';
    status.style.background = 'rgba(0,0,0,0.70)';
    status.style.color = '#fff';
    status.style.border = '1px solid #666';
    status.style.borderRadius = '4px';
    status.style.maxWidth = '130px';
    document.body.appendChild(status);
  };

  self.setup = function() {
    self.addCompactUI();
    console.log('Hiratsuka MOD Portal List v0.6.2 loaded');
  };

  var setup = self.setup;

  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);
  if (window.iitcLoaded) setup();
}

var script = document.createElement('script');
script.appendChild(document.createTextNode('(' + wrapper + ')();'));
(document.body || document.head || document.documentElement).appendChild(script);
