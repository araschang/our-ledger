/**
 * 我們的記帳本 — Google Sheet 後端（Google Apps Script Web App）
 * ---------------------------------------------------------------
 * 這支程式讓網站可以把資料讀/寫到你的 Google Sheet。
 *
 * 安裝步驟：
 *  1. 打開你的 Google Sheet
 *  2. 上方選單 擴充功能(Extensions) → Apps Script
 *  3. 把預設的 Code.gs 內容全部刪掉，貼上這整個檔案，存檔(💾)
 *  4. 右上角「部署(Deploy)」→「新增部署(New deployment)」
 *       類型選「網頁應用程式(Web app)」
 *       Execute as（執行身分）        ：Me（我）
 *       Who has access（誰可以存取）   ：Anyone（任何人）
 *     按「部署」，第一次會要你授權（Authorize）→ 允許
 *  5. 複製產生的「Web app URL」(結尾是 /exec)
 *  6. 回到記帳本 ⚙️ 設定 → 貼到「Google Sheet 網址」→ 儲存並連線
 *
 * 之後若有改這支程式，要重新「部署 → 管理部署 → 編輯 → 版本選 New version」。
 */

// ← 你的試算表 ID（已幫你填好，就是你分享連結中間那段）
const SHEET_ID = '1JMX65lNFWWBRarcNEprHzgHqXqjC7LiXg-33hVSWeUM';

// 可選：設一組密碼，記帳本設定裡也要填一樣的。留空字串 '' = 不設密碼。
const TOKEN = '';

const TXN_SHEET  = 'Transactions';
const META_SHEET = 'Meta';
const TXN_HEADERS = ['id', 'date', 'payer', 'category', 'item', 'amount', 'note', 'location', 'participants'];

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }

function getSheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); if (headers) sh.appendRow(headers); }
  if (sh.getLastRow() === 0 && headers) sh.appendRow(headers);
  return sh;
}

function fmtDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

function readTxns_() {
  const sh = getSheet_(TXN_SHEET, TXN_HEADERS);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0];
  const idx = {};
  TXN_HEADERS.forEach(function (h) { idx[h] = head.indexOf(h); });
  const out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row[idx.id]) continue;
    var parts = (idx.participants >= 0) ? String(row[idx.participants] || '') : '';
    out.push({
      id: String(row[idx.id]),
      date: fmtDate_(row[idx.date]),
      payer: String(row[idx.payer] || 'me'),
      category: String(row[idx.category] || 'other'),
      item: String(row[idx.item] || ''),
      amount: Number(row[idx.amount] || 0),
      note: String(row[idx.note] || ''),
      location: (idx.location >= 0) ? String(row[idx.location] || '') : '',
      participants: parts ? parts.split(',').map(function (s) { return s.trim(); }).filter(String) : []
    });
  }
  return out;
}

function readMeta_() {
  const sh = getSheet_(META_SHEET, ['key', 'value']);
  const values = sh.getDataRange().getValues();
  const meta = { budgets: {}, categories: [], people: [], settings: {} };
  for (var r = 1; r < values.length; r++) {
    var k = values[r][0];
    if (!k) continue;
    try { meta[k] = JSON.parse(values[r][1]); } catch (e) {}
  }
  return meta;
}

function writeMeta_(meta) {
  const sh = getSheet_(META_SHEET, ['key', 'value']);
  sh.clearContents();
  sh.appendRow(['key', 'value']);
  ['budgets', 'categories', 'people', 'settings'].forEach(function (k) {
    if (meta[k] !== undefined) sh.appendRow([k, JSON.stringify(meta[k])]);
  });
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function txnRow_(t) {
  var parts = Array.isArray(t.participants) ? t.participants.join(',') : (t.participants || '');
  return [t.id, t.date, t.payer, t.category, t.item, t.amount, t.note || '', t.location || '', parts];
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    if (TOKEN && (!e || e.parameter.token !== TOKEN)) return json_({ ok: false, error: 'bad token' });
    return json_({ ok: true, transactions: readTxns_(), meta: readMeta_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e2) {}
  try {
    const body = JSON.parse(e.postData.contents);
    if (TOKEN && body.token !== TOKEN) return json_({ ok: false, error: 'bad token' });
    const sh = getSheet_(TXN_SHEET, TXN_HEADERS);
    const action = body.action;

    if (action === 'replaceAll') {
      sh.clearContents();
      sh.appendRow(TXN_HEADERS);
      (body.transactions || []).forEach(function (t) { sh.appendRow(txnRow_(t)); });
      if (body.meta) writeMeta_(body.meta);

    } else if (action === 'add' || action === 'update') {
      var t = body.txn;
      var rownum = findRow_(sh, t.id);
      if (rownum > 0) sh.getRange(rownum, 1, 1, TXN_HEADERS.length).setValues([txnRow_(t)]);
      else sh.appendRow(txnRow_(t));

    } else if (action === 'delete') {
      var rn = findRow_(sh, body.id);
      if (rn > 0) sh.deleteRow(rn);

    } else if (action === 'meta') {
      writeMeta_(body.meta || {});

    } else {
      return json_({ ok: false, error: 'unknown action' });
    }

    return json_({ ok: true, transactions: readTxns_(), meta: readMeta_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }
}
