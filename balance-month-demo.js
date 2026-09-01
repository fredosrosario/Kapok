/*
 * Local-only balance demo helpers.
 * Enable with ?demo=1#coach. In demo mode, getState remains read-only while
 * every other API action is kept in memory and never sent to Supabase.
 */
const localDemo = new URLSearchParams(location.search).get('demo') === '1' || location.hash.includes('demo');

Object.assign(I.zh, {
  monthGuide: '按月份分開；付款只會套用到所選月份。',
  markMonthPaid: '已付款',
  noMonthDebt: '每月欠款已清。',
  transactionHistory: '交易記錄',
  demoNotice: '本地示範：付款變更只在此瀏覽器內暫存，不會寫入 Supabase。',
  paidThisMonth: '此月份已付清，仍欠 MOP ',
  allPaid: '已全部付清，所有月份都不再欠款。'
});
Object.assign(I.en, {
  monthGuide: 'Grouped by month; payment applies only to the selected month.',
  markMonthPaid: 'Paid this month',
  noMonthDebt: 'No monthly debt remains.',
  transactionHistory: 'Transaction history',
  demoNotice: 'Local demo: payment changes stay in this browser and are never sent to Supabase.',
  paidThisMonth: 'This month is paid; MOP ',
  allPaid: 'Paid in full; no monthly debt remains.'
});

document.head.insertAdjacentHTML('beforeend', '<style>' +
  '.demo-banner{margin:10px auto 0;max-width:760px;padding:10px 12px;border:1px solid #f2d28a;border-radius:12px;background:#fff8e6;color:#815b00;font-size:13px;font-weight:750}' +
  '.month-groups{margin-top:2px;padding:2px 0 8px}' +
  '.month-guide{padding:3px 0 8px;color:var(--m);font-size:13px}' +
  '.month-group{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid #e8ebef}' +
  '.month-group-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;flex:1}' +
  '.month-label{font-weight:900}' +
  '.month-pay{min-width:118px;white-space:nowrap}' +
  '.ledger-title{padding-top:8px;margin-top:2px;border-top:1px solid var(--l);font-size:13px;font-weight:850;color:var(--m)}' +
  '.usual-price-link{display:inline;width:auto;height:auto;min-height:0;padding:0 2px;border:0;border-radius:4px;background:transparent;color:var(--a);font:inherit;font-weight:850;text-decoration:underline dotted;text-underline-offset:2px;cursor:pointer}' +
  '@media(max-width:560px){.demo-banner{margin:8px 8px 0}.month-group{align-items:stretch;flex-direction:column}.month-pay{width:100%}}' +
  '</style>');

if (localDemo) {
  const demoOriginalPost = window.post;
  window.post = async function demoPost(action, payload = {}, pincode = '') {
    if (action !== 'getState') {
      if (action === 'verifyPin') return {ok: true};
      return {state};
    }
    return demoOriginalPost(action, payload, pincode);
  };

  window.load = async function demoLoad() {};
}

function monthName(m) {
  const [year, monthNumber] = m.split('-').map(Number);
  if (lang === 'zh') return year + '年' + monthNumber + '月';
  return new Intl.DateTimeFormat('en-US', {month: 'long', year: 'numeric', timeZone: TZ})
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

function balanceMonthRows(id) {
  return owedMonths(id, today().slice(0, 7));
}

function balanceMonthGroups(id) {
  const rows = balanceMonthRows(id);
  if (!rows.length) return '<div class="month-groups"><div class="empty">' + t('noMonthDebt') + '</div></div>';
  return '<div class="month-groups"><div class="month-guide">' + t('monthGuide') + '</div>' +
    rows.map(row => '<div class="month-group"><div class="month-group-head"><span class="month-label">' +
      monthName(row.m) + '</span><b class="neg">MOP ' + row.a + '</b></div>' +
      B('startMonthPaid', id + '|' + row.m, t('markMonthPaid'), 'soft month-pay') +
      '</div>').join('') + '</div>';
}

function balances() {
  const rows = [...state.swimmers]
    .sort((a, b) => bal(a.id) - bal(b.id))
    .filter(s => s.name.includes(search));
  return '<div class="card"><h3>' + t('balances') + '</h3><input placeholder="' + t('search') +
    '" value="' + esc(search) + '" oninput="search=this.value;render()"></div><div class="card">' +
    rows.map(s => {
      const balance = bal(s.id);
      const cls = balance < 0 ? 'neg' : balance > 0 ? 'pos' : 'zero';
      return '<div class="row"><div><div class="name">' + esc(s.name) +
        (s.archived ? ' <span class="pill">已封存</span>' : '') + '</div><div class="sub">' +
        t('usual') + '<button type="button" class="usual-price-link" data-id="' + s.id + '" aria-label="' +
        L('更改常用票價', 'Change usual price') + ' MOP ' + s.usualPrice + '" onclick="editUsualPrice(this.dataset.id)">' +
        s.usualPrice + '</button></div></div><div><div class="amt ' + cls + '">' +
        (balance > 0 ? '+' : '') + 'MOP ' + balance + '</div></div><div class="detail">' +
        balanceMonthGroups(s.id) + '<div class="ledger-title">' + t('transactionHistory') +
        '</div>' + ledger(s.id, false) + '</div></div>';
    }).join('') + '</div>';
}

function startMonthPaid(key) {
  const [id, selectedMonth] = key.split('|');
  const due = balanceMonthRows(id).find(row => row.m === selectedMonth)?.a || 0;
  if (!due) return;
  payDialog = {id, due, month: selectedMonth, step: 'confirm'};
  render();
}

function paymentModal() {
  if (!payDialog) return '';
  const swimmer = sw(payDialog.id);
  const due = payDialog.due;
  const selectedMonth = payDialog.month ? monthName(payDialog.month) : '';
  const title = L('記錄付款', 'Record payment') + ' · ' + esc(swimmer.name) +
    (selectedMonth ? ' · ' + selectedMonth : '');
  if (payDialog.step === 'partial') return '<div class="modalback" onclick="closePaid()"><section class="paymodal" role="dialog" aria-modal="true" aria-labelledby="paytitle" onclick="event.stopPropagation()"><div class="modalhead"><h3 id="paytitle">' +
    title + '</h3><button class="modalclose" onclick="closePaid()" aria-label="' + L('關閉', 'Close') +
    '">×</button></div><div class="paydue">' + L('本月份尚欠', 'This month owed') + ' MOP ' + due +
    '</div><label for="partialAmount">' + L('今次支付金額', 'Amount paid now') +
    '</label><input id="partialAmount" class="payinput" type="number" inputmode="numeric" min="1" max="' + due +
    '" placeholder="MOP"><div class="modalactions"><button onclick="recordPaid(false)">' + L('記錄付款', 'Record payment') +
    '</button><button class="ghost" onclick="closePaid()">' + L('取消', 'Cancel') +
    '</button></div></section></div>';
  return '<div class="modalback" onclick="closePaid()"><section class="paymodal" role="dialog" aria-modal="true" aria-labelledby="paytitle" onclick="event.stopPropagation()"><div class="modalhead"><h3 id="paytitle">' +
    title + '</h3><button class="modalclose" onclick="closePaid()" aria-label="' + L('關閉', 'Close') +
    '">×</button></div><div class="paydue">' + L('本月份尚欠', 'This month owed') + ' MOP ' + due +
    '</div><p class="payquestion">' + L('是否已支付 ' + selectedMonth + ' 的 MOP ' + due + '？', 'Was ' + selectedMonth +
      ' MOP ' + due + ' paid in full?') + '</p><div class="modalactions"><button onclick="recordPaid(true)">' +
    L('是，本月份付清', 'Yes, pay this month in full') + '</button><button class="ghost" onclick="partialPaid()">' +
    L('否，部分付款', 'No, partial payment') + '</button></div></section></div>';
}

async function recordPaid(full) {
  if (!payDialog || saving) return;
  const dialog = {...payDialog};
  const amount = full ? dialog.due : Number(document.querySelector('#partialAmount')?.value);
  if (!Number.isInteger(amount) || amount <= 0 || amount > dialog.due) {
    return alert(L('請輸入 1 至 ' + dialog.due + ' 的整數金額。', 'Enter a whole amount from 1 to ' + dialog.due + '.'));
  }
  const previous = cloneState();
  const now = new Date().toISOString();
  const settledMonth = amount === dialog.due;
  state.transactions.push({
    id: crypto.randomUUID(), swimmerId: dialog.id, type: 'payment', amount,
    date: now, label: 'MP payment', reason: settledMonth ? 'Paid ' + monthName(dialog.month) : 'Partial payment',
    ...(dialog.month ? {appliesToMonth: dialog.month} : {}), createdAt: now
  });
  const remaining = Math.max(0, -bal(dialog.id));
  payDialog = null;
  saving = true;
  render();
  try {
    await save();
    saving = false;
    render();
    alert(settledMonth ? (remaining ? L(t('paidThisMonth') + remaining, 'This month is paid; MOP ' + remaining + ' remains across other months.') : t('allPaid')) :
      L('已記錄付款 MOP ' + amount + '，本月份尚欠 MOP ' + (dialog.due - amount) + '。', 'MOP ' + amount + ' recorded for ' + monthName(dialog.month) + '; MOP ' + (dialog.due - amount) + ' remains for this month.'));
  } catch (e) {
    state = previous;
    payDialog = dialog;
    saving = false;
    render();
    alert(L('未能儲存付款，請再試一次。', 'Could not save the payment.'));
  }
}

let usualPriceDialog = null;

window.editUsualPrice = function editUsualPrice(id) {
  const swimmer = sw(id);
  if (!swimmer) return;
  usualPriceDialog = {id};
  render();
  setTimeout(() => document.querySelector('#usualPriceAmount')?.focus(), 0);
};

window.closeUsualPrice = function closeUsualPrice() {
  usualPriceDialog = null;
  render();
};

window.saveUsualPrice = async function saveUsualPrice() {
  if (!usualPriceDialog || saving) return;
  const swimmerId = usualPriceDialog.id;
  const swimmer = sw(swimmerId);
  const amount = Number(document.querySelector('#usualPriceAmount')?.value);
  if (!Number.isInteger(amount) || amount <= 0) return alert(t('badAmount'));
  if (amount === swimmer.usualPrice) return closeUsualPrice();
  const previous = cloneState();
  swimmer.usualPrice = amount;
  usualPriceDialog = null;
  saving = true;
  saveMsg = L('儲存中...', 'Saving...');
  render();
  try {
    await save();
    saving = false;
    saveMsg = L('已儲存', 'Saved');
    render();
    clearSaveMsg();
  } catch (e) {
    state = previous;
    usualPriceDialog = {id: swimmerId};
    saving = false;
    saveMsg = L('未能儲存', 'Save failed');
    render();
    alert(saveMsg);
  }
};

function usualPriceModal() {
  if (!usualPriceDialog) return '';
  const swimmer = sw(usualPriceDialog.id);
  const title = L('更改常用票價', 'Change usual price') + ' · ' + esc(swimmer.name);
  return '<div class="modalback" onclick="closeUsualPrice()"><section class="paymodal" role="dialog" aria-modal="true" aria-labelledby="usualpricetitle" onclick="event.stopPropagation()"><div class="modalhead"><h3 id="usualpricetitle">' +
    title + '</h3><button class="modalclose" onclick="closeUsualPrice()" aria-label="' + L('關閉', 'Close') +
    '">×</button></div><label for="usualPriceAmount">' + L('每次出席的常用票價（MOP）', 'Usual fee per attendance (MOP)') +
    '</label><input id="usualPriceAmount" class="payinput" type="number" inputmode="numeric" min="1" step="1" value="' +
    swimmer.usualPrice + '" onkeydown="if(event.key===\'Enter\')saveUsualPrice()"><div class="modalactions"><button onclick="saveUsualPrice()">' +
    L('儲存票價', 'Save fee') + '</button><button class="ghost" onclick="closeUsualPrice()">' + L('取消', 'Cancel') +
    '</button></div></section></div>';
}

function coach() {
  if (tab === 'pending') tab = 'attendance';
  return head('門票管理') + (localDemo ? '<div class="demo-banner" role="status">' + t('demoNotice') +
    '</div>' : '') + '<main>' + pane() + '</main><div class="tabs" style="grid-template-columns:repeat(4,1fr)">' +
    ['attendance:' + t('attendance'), 'balances:' + t('balances'), 'message:' + t('message'), 'settings:' + t('settings')]
      .map(x => {let [k, v] = x.split(':'); return '<button class="' + (tab === k ? 'on' : '') + '" data-tab="' + k +
        '" onclick="setTab(this.dataset.tab)">' + v + '</button>';}).join('') + '</div>' + paymentModal() + usualPriceModal();
}

function owedMonths(id, m) {
  const end = monthEnd(m), buckets = {}, keys = [];
  let credit = 0;
  state.transactions.filter(t => t.swimmerId === id && new Date(t.date) <= end)
    .sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(tx => {
      const key = tx.date.slice(0, 7);
      if (!Object.prototype.hasOwnProperty.call(buckets, key)) {buckets[key] = 0; keys.push(key);}
      if (tx.amount < 0) {
        let due = -tx.amount;
        const usedCredit = Math.min(credit, due);
        credit -= usedCredit;
        due -= usedCredit;
        if (due) buckets[key] += due;
      } else if (tx.amount > 0) {
        let amount = tx.amount;
        const target = tx.appliesToMonth;
        if (target && Object.prototype.hasOwnProperty.call(buckets, target)) {
          const targetUse = Math.min(buckets[target], amount);
          buckets[target] -= targetUse;
          amount -= targetUse;
        }
        keys.sort().forEach(existingMonth => {
          const use = Math.min(buckets[existingMonth], amount);
          buckets[existingMonth] -= use;
          amount -= use;
        });
        credit += amount;
      }
    });
  return keys.filter(key => key <= m && buckets[key] > 0).sort().map(key => ({m: key, a: buckets[key]}));
}

if (localDemo) {
  setTimeout(() => {if (state) render();}, 250);
}
