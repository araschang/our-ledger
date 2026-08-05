/**
 * 我們的記帳本 — Google Sheet API 層（Google Apps Script Web App）
 * ----------------------------------------------------------------
 * 唯一的後端。Streamlit 網站和 Apple Shortcut 都打這一個 endpoint。
 *
 * 安裝：
 *  1. 開你的 Google 試算表 → 擴充功能 → Apps Script
 *  2. 貼上這整個檔案，把下面 SHEET_ID 換成你的試算表 ID、TOKEN 設一組密碼
 *  3. 部署 → 新增部署 → 網頁應用程式
 *     Execute as: Me ／ Who has access: Anyone
 *  4. 複製 Web app URL（結尾 /exec）→ 填進 Streamlit secrets 和 Shortcut
 *
 * API：
 *  GET  ?token=...                    → { ok, transactions, meta }
 *  POST { token, action, ... }
 *    action=add    txn:{...}          → 新增（id/created_at 缺省時後端補）
 *    action=update txn:{id,...}       → 依 id 覆寫整列
 *    action=delete id                 → 刪除
 *    action=meta   meta:{...}         → 覆寫 Meta 表
 *  所有 POST 都回 { ok, transactions, meta }（最新全量，前端直接刷新用）
 */

const SHEET_ID = 'PASTE_YOUR_SPREADSHEET_ID_HERE';
const TOKEN = 'CHANGE_ME'; // 跟 Streamlit secrets / Shortcut 裡填一樣的

const TZ = 'America/Vancouver'; // 「今天」以溫哥華為準（主機/帳號時區都不可靠）

const TXN_SHEET = 'Transactions';
const META_SHEET = 'Meta';
const HEADERS = ['id', 'created_at', 'date', 'person', 'type', 'category',
                 'item', 'amount', 'note', 'location', 'shared', 'source', 'currency',
                 'split'];
// split: half=兩人對半 / own=自己的 / advance=代墊(對方欠全額)

let SS_ = null;
function ss_() {
  if (!SS_) SS_ = SpreadsheetApp.openById(SHEET_ID);
  return SS_;
}

function sheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0 && headers) {
    sh.appendRow(headers);
  } else if (headers &&
             sh.getRange(1, 1, 1, headers.length).getValues()[0].join('') !==
             headers.join('')) {
    // schema 升級：新欄位一律加在最後，覆寫表頭列即可、舊資料位置不變
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

function fmtDate_(v) {
  // 不用 instanceof：Apps Script V8 的 instanceof Date 有時會誤判。
  // 日期儲存格是「試算表時區的午夜」，要用試算表時區格式化才不會差一天。
  if (v && typeof v.getFullYear === 'function') {
    return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return String(v || '').slice(0, 10);
}

function fmtDateTime_(v) {
  if (v && typeof v.getFullYear === 'function') {
    return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }
  return String(v || '');
}

function rowToTxn_(row, idx) {
  return {
    id: String(row[idx.id]),
    created_at: fmtDateTime_(row[idx.created_at]),
    date: fmtDate_(row[idx.date]),
    person: String(row[idx.person] || ''),
    type: String(row[idx.type] || 'expense'),
    category: String(row[idx.category] || 'other'),
    item: String(row[idx.item] || ''),
    amount: Number(row[idx.amount] || 0),
    note: String(row[idx.note] || ''),
    location: String(row[idx.location] || ''),
    shared: String(row[idx.shared]).toUpperCase() === 'TRUE',
    source: String(row[idx.source] || ''),
    currency: (idx.currency >= 0 && row[idx.currency]) ? String(row[idx.currency]) : 'CAD',
    split: (idx.split >= 0 && ['half','own','advance'].indexOf(String(row[idx.split])) >= 0)
      ? String(row[idx.split])
      : (String(row[idx.shared]).toUpperCase() === 'TRUE' ? 'half' : 'own'),
  };
}

function toBool_(v) {
  // Shortcut 可能送字串；也接受捷徑清單直接送的中文選項。
  // 中文用 \u 逃逸寫死（共同=共同、是=是），避免複製貼上時編碼出問題。
  const s = String(v).trim().toLowerCase();
  return v === true || s === 'true' ||
         s === '\u5171\u540c' || s === '\u662f'; // = '共同' / '是'
}

function splitOf_(t) {
  // 分法：優先看明確的 split，否則從 shared 推導（捷徑只送 shared 一個欄位）
  const sp = String(t.split || '').trim().toLowerCase();
  if (sp === 'half' || sp === 'own' || sp === 'advance') return sp;
  const sh = String(t.shared === undefined ? '' : t.shared).trim().toLowerCase();
  if (sh === 'advance' || sh === '\u4ee3\u588a') return 'advance'; // = '代墊'
  return toBool_(t.shared) ? 'half' : 'own';
}

function txnToRow_(t) {
  return [
    t.id, t.created_at || '', t.date || '', t.person || '', t.type || 'expense',
    t.category || 'other', t.item || '', Number(t.amount) || 0, t.note || '',
    t.location || '', splitOf_(t) === 'half' ? 'TRUE' : 'FALSE', t.source || '',
    t.currency || 'CAD', splitOf_(t),
  ];
}

function readTxns_() {
  const sh = sheet_(TXN_SHEET, HEADERS);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const idx = {};
  HEADERS.forEach(function (h) { idx[h] = values[0].indexOf(h); });
  const out = [];
  for (let r = 1; r < values.length; r++) {
    if (values[r][idx.id]) out.push(rowToTxn_(values[r], idx));
  }
  return out;
}

function readMeta_() {
  const sh = sheet_(META_SHEET, ['key', 'value']);
  const values = sh.getDataRange().getValues();
  const meta = {};
  for (let r = 1; r < values.length; r++) {
    if (!values[r][0]) continue;
    try { meta[values[r][0]] = JSON.parse(values[r][1]); } catch (e) {}
  }
  return meta;
}

function writeMeta_(meta) {
  const sh = sheet_(META_SHEET, ['key', 'value']);
  sh.clearContents();
  sh.appendRow(['key', 'value']);
  Object.keys(meta || {}).forEach(function (k) {
    sh.appendRow([k, JSON.stringify(meta[k])]);
  });
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok_() {
  return json_({ ok: true, transactions: readTxns_(), meta: readMeta_() });
}

function doGet(e) {
  try {
    if (TOKEN && (!e || !e.parameter || e.parameter.token !== TOKEN)) {
      return json_({ ok: false, error: 'bad token' });
    }
    return ok_();
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
    const sh = sheet_(TXN_SHEET, HEADERS);

    if (body.action === 'add') {
      const t = body.txn || {};
      if (!t.id) t.id = Utilities.getUuid().slice(0, 8);
      if (!t.created_at) {
        t.created_at = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
      }
      if (!t.date) t.date = t.created_at.slice(0, 10);
      sh.appendRow(txnToRow_(t));

    } else if (body.action === 'update') {
      const t = body.txn || {};
      const rn = findRow_(sh, t.id);
      if (rn < 0) return json_({ ok: false, error: 'id not found: ' + t.id });
      sh.getRange(rn, 1, 1, HEADERS.length).setValues([txnToRow_(t)]);

    } else if (body.action === 'delete') {
      const rn = findRow_(sh, body.id);
      if (rn > 0) sh.deleteRow(rn);

    } else if (body.action === 'meta') {
      writeMeta_(body.meta || {});

    } else {
      return json_({ ok: false, error: 'unknown action: ' + body.action });
    }
    return ok_();
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e3) {}
  }
}
