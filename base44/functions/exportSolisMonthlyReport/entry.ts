import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { createHmac, createHash } from 'node:crypto';

const SOLIS_KEY_ID = Deno.env.get('SOLIS_API_KEY_ID');
const SOLIS_KEY_SECRET = Deno.env.get('SOLIS_API_KEY_SECRET');
const SOLIS_BASE_URL = (Deno.env.get('SOLIS_API_URL') || 'https://www.soliscloud.com:13333').replace(/\/$/, '');

function getGMTDate() {
  return new Date().toUTCString().replace('UTC', 'GMT');
}
function md5Base64(str) {
  return createHash('md5').update(str, 'utf8').digest('base64');
}
function hmacSHA1Base64(secret, str) {
  return createHmac('sha1', secret).update(str, 'utf8').digest('base64');
}
function buildHeaders(endpoint, bodyStr) {
  const date = getGMTDate();
  const contentType = 'application/json';
  const contentMD5 = md5Base64(bodyStr);
  const signStr = `POST\n${contentMD5}\n${contentType}\n${date}\n${endpoint}`;
  const sign = hmacSHA1Base64(SOLIS_KEY_SECRET, signStr);
  return {
    'Content-Type': contentType,
    'Content-MD5': contentMD5,
    'Date': date,
    'Authorization': `API ${SOLIS_KEY_ID}:${sign}`
  };
}
async function solisPost(endpoint, body) {
  const bodyStr = JSON.stringify(body);
  const headers = buildHeaders(endpoint, bodyStr);
  const url = `${SOLIS_BASE_URL}${endpoint}`;
  const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
  return await res.json();
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { stationId, tariffPerKwh } = await req.json();
    if (!stationId) return Response.json({ error: 'stationId required' }, { status: 400 });

    const tariff = tariffPerKwh || 0.35;

    // Get station detail for name and capacity
    const detail = await solisPost('/v1/api/stationDetail', { id: stationId });
    const stationName = detail?.data?.stationName || 'Unknown';
    const capacity = detail?.data?.capacity || 0;

    // Use stationYear API - returns monthly summary directly for the station
    const now = new Date();
    const currentYear = now.getFullYear();
    const startYear = 2025; // station creation year
    
    const monthlyData = [];
    
    for (let year = startYear; year <= currentYear; year++) {
      await delay(600);
      const res = await solisPost('/v1/api/stationYear', {
        id: stationId,
        money: "ILS",
        year: String(year),
        nmiFlag: 0
      });
      
      const records = Array.isArray(res?.data) ? res.data : [];
      for (const r of records) {
        const energyKwh = r.energy || 0;
        if (energyKwh === 0) continue;
        
        monthlyData.push({
          month: r.dateStr, // "YYYY-MM"
          totalKwh: energyKwh,
          totalMoney: r.money || 0,
          totalGridSell: r.gridSellEnergy || 0,
          totalHomeLoad: r.homeLoadEnergy || 0,
          totalGridPurchased: r.gridPurchasedEnergy || 0,
          days: 0, // not available from yearly summary
        });
      }
    }
    
    monthlyData.sort((a, b) => a.month.localeCompare(b.month));

    // Build CSV with BOM for Hebrew Excel support
    const BOM = '\uFEFF';
    const headers_csv = ['חודש', 'ייצור (kWh)', 'הכנסה (₪)', 'מכירה לרשת (kWh)', 'צריכה עצמית (kWh)', 'קנייה מרשת (kWh)'];
    let csv = BOM + headers_csv.join(',') + '\n';

    let grandTotalKwh = 0;
    let grandTotalMoney = 0;

    const monthNames = {
      '01': 'ינואר', '02': 'פברואר', '03': 'מרץ', '04': 'אפריל',
      '05': 'מאי', '06': 'יוני', '07': 'יולי', '08': 'אוגוסט',
      '09': 'ספטמבר', '10': 'אוקטובר', '11': 'נובמבר', '12': 'דצמבר'
    };

    for (const m of monthlyData) {
      const [year, mon] = m.month.split('-');
      const monthLabel = `${monthNames[mon]} ${year}`;
      csv += `${monthLabel},${m.totalKwh.toFixed(1)},${m.totalMoney.toFixed(2)},${m.totalGridSell.toFixed(1)},${m.totalHomeLoad.toFixed(1)},${m.totalGridPurchased.toFixed(1)}\n`;
      grandTotalKwh += m.totalKwh;
      grandTotalMoney += m.totalMoney;
    }

    csv += `\nסה"כ,${grandTotalKwh.toFixed(1)},${grandTotalMoney.toFixed(2)},,,\n`;
    csv += `\nפרטי המערכת\n`;
    csv += `שם תחנה,${stationName}\n`;
    csv += `הספק מותקן (kWp),${capacity}\n`;
    csv += `תעריף (₪/kWh),${tariff}\n`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=production_report_${stationId}.csv`
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});