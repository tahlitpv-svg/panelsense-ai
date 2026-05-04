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

    // Fetch all daily records - iterate through months from installation to now
    // Station was created 2025-03-28, so start from 2025-03
    const allDays = [];
    const startYear = 2025;
    const startMonth = 3;
    const now = new Date();
    const endYear = now.getFullYear();
    const endMonth = now.getMonth() + 1;

    for (let y = startYear; y <= endYear; y++) {
      const mStart = (y === startYear) ? startMonth : 1;
      const mEnd = (y === endYear) ? endMonth : 12;
      for (let m = mStart; m <= mEnd; m++) {
        const timeStr = `${y}-${String(m).padStart(2, '0')}-01`;
        await delay(1200); // rate limit
        const res = await solisPost('/v1/api/stationDayEnergyList', {
          id: stationId,
          money: "ILS",
          time: timeStr,
          pageNo: 1,
          pageSize: 100
        });
        const records = res?.data?.records || [];
        for (const r of records) {
          // Filter only records matching our station
          if (r.id !== stationId) continue;
          
          // energy field is the display value; energyPec is the multiplier
          // energy * energyPec gives kWh when energyStr is "MWh" etc.
          // Actually: energy is already in kWh, energyStr/energyPec are for display only
          const energyKwh = r.energy || 0;
          
          allDays.push({
            date: r.dateStr,
            energyKwh,
            money: r.money || 0,
            gridSellEnergy: r.gridSellEnergy || 0,
            homeLoadEnergy: r.homeLoadEnergy || 0,
            gridPurchasedEnergy: r.gridPurchasedEnergy || 0,
          });
        }
      }
    }

    // Sort by date
    allDays.sort((a, b) => a.date.localeCompare(b.date));

    // Aggregate by month
    const monthlyMap = {};
    for (const day of allDays) {
      const monthKey = day.date.substring(0, 7); // YYYY-MM
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { month: monthKey, totalKwh: 0, totalMoney: 0, totalGridSell: 0, totalHomeLoad: 0, totalGridPurchased: 0, days: 0 };
      }
      monthlyMap[monthKey].totalKwh += day.energyKwh;
      monthlyMap[monthKey].totalMoney += day.money;
      monthlyMap[monthKey].totalGridSell += day.gridSellEnergy;
      monthlyMap[monthKey].totalHomeLoad += day.homeLoadEnergy;
      monthlyMap[monthKey].totalGridPurchased += day.gridPurchasedEnergy;
      monthlyMap[monthKey].days++;
    }

    const monthlyData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

    // Build CSV with BOM for Hebrew Excel support
    const BOM = '\uFEFF';
    const headers_csv = ['חודש', 'ייצור (kWh)', 'הכנסה (₪)', 'מכירה לרשת (kWh)', 'צריכה עצמית (kWh)', 'קנייה מרשת (kWh)', 'ימי ייצור'];
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
      csv += `${monthLabel},${m.totalKwh.toFixed(1)},${m.totalMoney.toFixed(2)},${m.totalGridSell.toFixed(1)},${m.totalHomeLoad.toFixed(1)},${m.totalGridPurchased.toFixed(1)},${m.days}\n`;
      grandTotalKwh += m.totalKwh;
      grandTotalMoney += m.totalMoney;
    }

    csv += `\nסה"כ,${grandTotalKwh.toFixed(1)},${grandTotalMoney.toFixed(2)},,,,\n`;
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