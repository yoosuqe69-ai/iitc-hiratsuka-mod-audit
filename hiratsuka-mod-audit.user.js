// ==UserScript==
// @id             iitc-plugin-hiratsuka-mod-audit
// @name           IITC plugin: Hiratsuka MOD Portal List (Manual-Storage)
// @category       Info
// @version        0.6.3
// @description    Hiratsuka MOD audit - Manual Tap Data Organizer UI
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper() {
  if (typeof window.plugin !== 'function') window.plugin = function() {};

  window.plugin.hiratsukaModAudit = function() {};
  var self = window.plugin.hiratsukaModAudit;

  self.MIN_LEVEL = 6;
  self.TARGET_TEAM = 'E';
  self.sortMode = 'weak';
  
  // 手動で詳細ロードが成功した既知データをセッション内で保持するストレージ
  self.auditStorage = {}; 

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

  self.analyzeMods = function(mods) {
    var result = { known: true, shield: [], turret: false, fa: false, hack: [], empty: 0, judge: '軽い', weakScore: 0, hardScore: 0, weakLabel: '不明' };
    if (!Array.isArray(mods)) {
      result.known = false; result.judge = 'MOD未取得'; result.weakLabel = '未取得';
      return result;
    }

    for (var i = 0; i < 4; i++) {
      var mod = mods[i] ? mods[i] : null;
      if (!mod) { result.empty++; continue; }
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

    result.hardScore += vr * 4 + rare * 3 + common * 1;
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

    if (result.shield.length >= 2 || vr >= 1) result.judge = '硬い';
    if (result.turret && result.fa) result.judge = (result.judge === '硬い' ? '硬い+反撃重い' : '反撃重い');
    else if (result.turret || result.fa) result.judge = (result.judge === '硬い' ? '硬い+反撃あり' : '反撃あり');
    if (result.shield.length === 0 && !result.turret && !result.fa && result.hack.length === 0 && result.empty === 4) result.judge = 'MODなし';

    if (result.weakScore >= 7) result.weakLabel = '脆弱A';
    else if (result.weakScore >= 4) result.weakLabel = '脆弱B';
    else if (result.weakScore >= 1) result.weakLabel = '脆弱C';
    else result.weakLabel = '堅牢';

    return result;
  };

  self.storePortalDetails = function(guid, portalInstance) {
    if (!guid || !portalInstance || !portalInstance.options || !portalInstance.options.data) return false;
    
    var d = portalInstance.options.data;
    var detail = window.portalDetail ? window.portalDetail.get(guid) : null;
    var mods = undefined;
    
    if (detail && Array.isArray(detail.mods)) mods = detail.mods;
    else if (d && Array.isArray(d.mods)) mods = d.mods;

    if (!Array.isArray(mods)) return false;

    var m = self.analyzeMods(mods);
    var team = d.team || '-';
    var faction = team === 'E' ? 'ENL' : team === 'R' ? 'RES' : team || '-';

    self.auditStorage[guid] = {
      guid: guid,
      title: d.title || '(no name)',
      faction: faction,
      team: team,
      level: d.level || 0,
      health: d.health || 0,
      shield: m.shield.length ? m.shield.join(',') : '-',
      turret: m.turret ? '有' : '-',
      fa: m.fa ? '有' : '-',
      hack: m.hack.length ? m.hack.join(',') : '-',
      empty: m.empty,
      judge: m.judge,
      known: true,
      weakScore: m.weakScore,
      hardScore: m.hardScore,
      weakLabel: m.weakLabel
    };
    return true;
  };

  self.getRecords = function() {
    var arr = [];
    var bounds = (window.map && typeof window.map.getBounds === 'function') ? window.map.getBounds() : null;
    if (!bounds) return arr;

    Object.keys(window.portals || {}).forEach(function(guid) {
      var p = window.portals[guid];
      if (!p || !p.options || !p.options.data) return;
      if (!bounds.contains(p.getLatLng())) return;

      var d = p.options.data;
      if (!d.team || d.team === 'N') return;
      if (self.TARGET_TEAM && d.team !== self.TARGET_TEAM) return;
      if ((d.level || 0) < self.MIN_LEVEL) return;

      if (self.auditStorage[guid]) {
        arr.push(self.auditStorage[guid]);
      } else {
        arr.push({
          guid: guid, title: d.title || '(no name)', faction: d.team === 'E' ? 'ENL' : 'RES', team: d.team,
          level: d.level || 0, health: d.health || 0, shield: '未取得', turret: '-', fa: '-', hack: '-', empty: '-',
          judge: '未取得', known: false, weakScore: -99, hardScore: -99, weakLabel: '未取得'
        });
      }
    });

    arr.sort(function(a, b) {
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

    return arr;
  };

  self.updateStatus = function() {
    var box = document.getElementById('hiratsuka-mod-audit-status');
    if (!box) return;
    var records = self.getRecords();
    var known = records.filter(function(r) { return r.known; }).length;
    box.textContent = '手動蓄積中: ' + known + '/' + records.length;
  };

  self.setSort = function(mode) {
    self.sortMode = mode;
    self.renderPanel();
  };

  self.buildLog = function() {
    var records = self.getRecords();
    var lines = [
      '【平塚MOD Portal List v0.6.3 (手動取得データ整理型)】',
      '方式：手動タップ詳細ロード検知 / リアルタイム蓄積 / ソート=' + self.sortMode,
      '条件：表示範囲内 / ENL / L' + self.MIN_LEVEL + '以上',
      '形式：Portal / Faction / Lv / Health / Shield / Turret / FA / 判定 / 脆弱度\n'
    ];
    records.forEach(function(r) {
      lines.push([r.title, r.faction, 'L' + r.level, r.health + '%', r.shield, r.turret, r.fa, r.judge, r.weakLabel].join(' / '));
    });
    return lines.join('\n');
  };

  self.copyLog = function() {
    var text = self.buildLog();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() { alert('MODリストをコピーしました'); }).catch(function() { prompt('コピーしてください', text); });
    } else { prompt('コピーしてください', text); }
  };

  self.renderPanel = function() {
    var panel = document.getElementById('hiratsuka-mod-panel');
    if (!panel || panel.style.display === 'none') return;

    var records = self.getRecords();
    var known = records.filter(function(r) { return r.known; }).length;

    var html = '<div style="font-weight:bold;margin-bottom:4px;">平塚MOD List v0.6.3 <button id="hiratsuka-mod-panel-close" style="float:right;background:#333;color:#fff;border:1px solid #aaa;border-radius:3px;">×</button></div>';
    html += '<div style="color:#aaa;">取得: ' + known + '/' + records.length + ' 件 (並び:' + self.sortMode + ')</div>';
    html += '<table style="width:100%;border-collapse:collapse;margin-top:4px;">';
    html += '<tr><th style="text-align:left;">Portal</th><th>Lv</th><th>盾</th><th>T</th><th>FA</th><th>判定</th></tr>';

    records.forEach(function(r) {
      var rowColor = r.known ? '#fff' : '#666'; 
      html += '<tr style="border-top:1px solid #555; color:' + rowColor + ';">';
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
    if (closeBtn) closeBtn.onclick = function() { panel.style.display = 'none'; };
    self.updateStatus();
  };

  self.togglePanel = function() {
    var panel = document.getElementById('hiratsuka-mod-panel');
    if (!panel) {
      panel = document.createElement('div'); panel.id = 'hiratsuka-mod-panel';
      panel.style = 'position:absolute;left:8px;bottom:50px;z-index:9998;width:78%;max-height:42%;overflow:auto;background:rgba(0,0,0,0.88);color:#fff;font-size:11px;padding:8px;border:1px solid #777;border-radius:4px;';
      document.body.appendChild(panel);
    }
    panel.style.display = (panel.style.display === 'none' ? 'block' : 'none');
    self.renderPanel();
  };

  self.addCompactUI = function() {
    if (document.getElementById('hiratsuka-mod-main-btn')) return;

    var main = document.createElement('button');
    main.id = 'hiratsuka-mod-main-btn'; main.textContent = 'MOD';
    main.style = 'position:absolute;right:8px;bottom:45px;z-index:10000;padding:8px 12px;font-size:13px;background:#222;color:#fff;border:1px solid #aaa;border-radius:5px;';
    main.onclick = function() {
      var m = document.getElementById('hiratsuka-mod-menu');
      if (m) m.style.display = (m.style.display === 'none' ? 'block' : 'none');
    };
    document.body.appendChild(main);

    var menu = document.createElement('div');
    menu.id = 'hiratsuka-mod-menu';
    menu.style = 'position:absolute;right:8px;bottom:86px;z-index:10000;width:98px;padding:5px;background:rgba(0,0,0,0.85);border:1px solid #777;border-radius:5px;display:none;';

    var addButton = function(text, h) {
      var b = document.createElement('button'); b.textContent = text;
      b.style = 'display:block;width:100%;margin:3px 0;padding:6px 8px;font-size:12px;background:#222;color:#fff;border:1px solid #888;border-radius:4px;';
      b.onclick = h; menu.appendChild(b);
    };

    addButton('一覧', self.togglePanel);
    addButton('コピー', self.copyLog);
    addButton('脆弱順', function() { self.setSort('weak'); });
    addButton('硬い順', function() { self.setSort('hard'); });
    addButton('反撃順', function() { self.setSort('react'); });
    addButton('閉じる', function() { menu.style.display = 'none'; });
    document.body.appendChild(menu);

    var status = document.createElement('div');
    status.id = 'hiratsuka-mod-audit-status'; status.textContent = '手動監視中';
    status.style = 'position:absolute;right:8px;bottom:89px;z-index:9999;padding:4px 6px;font-size:10px;background:rgba(0,0,0,0.7);color:#fff;border:1px solid #666;border-radius:4px;';
    document.body.appendChild(status);
  };

  self.setup = function() {
    self.addCompactUI();
    
    // ★監査指摘対応：addHookの存在チェックをReferenceErrorが出ない記述へ完全安全化
    var hookFn = window.addHook || (typeof addHook === 'function' ? addHook : null);
    if (typeof hookFn === 'function') {
      hookFn('portalDetailLoaded', function(data) {
        if (data && data.success) {
          var guid = data.guid || data.portalGuid || data.selectedPortalGuid || window.selectedPortal;
          if (guid) {
            var p = window.portals[guid];
            if (p) {
              var stored = self.storePortalDetails(guid, p);
              if (stored) {
                self.updateStatus();
                self.renderPanel();
              }
            }
          }
        }
      });
    }

    // ★監査指摘対応：window.mapのオブジェクト存在チェックを徹底
    if (window.map && typeof window.map.on === 'function') {
      window.map.on('moveend zoomend', function() { self.renderPanel(); });
    }
    console.log('IITC plugin: Hiratsuka MOD Portal List v0.6.3 loaded');
  };

  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(self.setup);
  if (window.iitcLoaded) self.setup();
}

var script = document.createElement('script');
script.appendChild(document.createTextNode('(' + wrapper + ')();'));
(document.body || document.head || document.documentElement).appendChild(script);
