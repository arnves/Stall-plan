import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, Plus, Calendar as CalendarIcon, Printer, RefreshCw, User, AlertCircle, Check, X, Download, Settings, Mail } from 'lucide-react';

/* STABLE SCHEDULER
  A self-contained React application for managing stable duty rosters.
  Features:
  - Rider Management (names, specific blocked dates)
  - Unlimited blocked dates
  - 2-Pass Algorithm: Prioritizes Saturdays (Pass 1) then fills others (Pass 2)
  - Consecutive day avoidance (Lookahead & Lookbehind)
  - Consecutive weekend avoidance
  - iCal (.ics) export with configurable event name & description
*/

// --- Utility Functions ---

const generateDates = (startDate, endDate) => {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  const dates = [];
  const current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const isWeekendDay = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday or Saturday
};

const isSaturday = (date) => date.getDay() === 6;

const isFriSatSun = (date) => {
  const day = date.getDay();
  return day === 5 || day === 6 || day === 0;
};

// Timezone safe format YYYY-MM-DD
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatICalDate = (dateStr) => {
  return dateStr.replace(/-/g, '');
};

const getMonthName = (date) => {
  return date.toLocaleString('nb-NO', { month: 'long', year: 'numeric' });
};

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, title = '' }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
    secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
    ghost: "text-gray-600 hover:bg-gray-100"
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseStyle} ${variants[variant]} ${className}`}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
};

const Card = ({ children, title, className = '' }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
    {title && (
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
    )}
    <div className="p-6">
      {children}
    </div>
  </div>
);

// --- Main Application ---

export default function App() {
  // --- State ---
  const [riders, setRiders] = useState([
    { id: 1, name: 'Elin', color: 'bg-blue-100 text-blue-800 border-blue-200', blockedDates: [] },
    { id: 2, name: 'Anne', color: 'bg-green-100 text-green-800 border-green-200', blockedDates: [] },
    { id: 3, name: 'Silvia', color: 'bg-purple-100 text-purple-800 border-purple-200', blockedDates: [] },
    { id: 4, name: 'Hedda', color: 'bg-orange-100 text-orange-800 border-orange-200', blockedDates: [] },
    { id: 5, name: 'Kristel', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', blockedDates: [] },
    { id: 6, name: 'Marion', color: 'bg-red-100 text-red-800 border-red-200', blockedDates: [] },
  ]);

  const [config, setConfig] = useState(() => {
    const start = new Date();
    const startStr = start.toISOString().split('T')[0].substring(0, 7) + '-01'; // YYYY-MM-01

    // Default end date: Last day of the start month
    const end = new Date(startStr);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    const endStr = end.toISOString().split('T')[0];

    return {
      startDate: startStr,
      endDate: endStr
    };
  });

  const [eventName, setEventName] = useState('Stallvakt');
  const [eventDescription, setEventDescription] = useState('Du er satt opp på stallvakt i dag.');
  const [schedule, setSchedule] = useState({}); // { "2023-10-01": riderId }
  const [view, setView] = useState('setup'); // 'setup' | 'calendar'
  const [activeRiderId, setActiveRiderId] = useState(null); // For configuration modal

  // --- Logic: The Scheduler ---

  const generateSchedule = () => {
    const dates = generateDates(config.startDate, config.endDate);
    const newSchedule = {};

    // Stats tracking
    const stats = riders.reduce((acc, r) => {
      acc[r.id] = { total: 0, saturdays: 0 };
      return acc;
    }, {});

    const shuffle = (array) => array.sort(() => Math.random() - 0.5);

    // --- Helpers ---

    const workedLastWeekend = (currentDate, candidateId) => {
      const checkDates = [];
      const d = new Date(currentDate);
      // Find the most recent COMPLETED weekend.
      const check = new Date(currentDate);
      // Go back to last Sunday
      while (check.getDay() !== 0) { check.setDate(check.getDate() - 1); }
      // Now check is last Sunday.
      const lastSun = new Date(check);
      const lastSat = new Date(check); lastSat.setDate(check.getDate() - 1);
      const lastFri = new Date(check); lastFri.setDate(check.getDate() - 2);

      return [lastFri, lastSat, lastSun].some(d => {
        if (d >= currentDate) return false;
        return newSchedule[formatDate(d)] === candidateId;
      });
    };

    // --- PASS 1: SATURDAYS (The "Anchor" Days) ---

    dates.filter(d => isSaturday(d)).forEach(date => {
      const dateStr = formatDate(date);

      // 1. Availability
      let candidates = riders.filter(r => !r.blockedDates.includes(dateStr));

      // 2. Soft Constraint: Avoid Consecutive Saturdays
      const prevSat = new Date(date);
      prevSat.setDate(date.getDate() - 7);
      const prevSatWorker = newSchedule[formatDate(prevSat)];

      let softCandidates = candidates.filter(r => r.id !== prevSatWorker);
      if (softCandidates.length > 0) candidates = softCandidates;

      if (candidates.length === 0) {
        newSchedule[dateStr] = null;
        return;
      }

      // 3. Sort STRICTLY by Saturday count
      candidates = shuffle(candidates).sort((a, b) => {
        const statsA = stats[a.id];
        const statsB = stats[b.id];
        if (statsA.saturdays !== statsB.saturdays) {
          return statsA.saturdays - statsB.saturdays;
        }
        return statsA.total - statsB.total;
      });

      const chosen = candidates[0];
      newSchedule[dateStr] = chosen.id;
      stats[chosen.id].total++;
      stats[chosen.id].saturdays++;
    });

    // --- PASS 2: ALL OTHER DAYS (The "Fill") ---

    dates.filter(d => !isSaturday(d)).forEach(date => {
      const dateStr = formatDate(date);

      // 1. Availability
      let candidates = riders.filter(r => !r.blockedDates.includes(dateStr));

      // 2. Hard Constraint: Consecutive Days
      const yesterday = new Date(date);
      yesterday.setDate(date.getDate() - 1);
      const yesterdayWorker = newSchedule[formatDate(yesterday)];

      const tomorrow = new Date(date);
      tomorrow.setDate(date.getDate() + 1);
      const tomorrowWorker = newSchedule[formatDate(tomorrow)];

      let nonConsecutiveCandidates = candidates.filter(r =>
        r.id !== yesterdayWorker && r.id !== tomorrowWorker
      );

      if (nonConsecutiveCandidates.length > 0) {
        candidates = nonConsecutiveCandidates;
      } else {
        candidates = candidates.filter(r => r.id !== tomorrowWorker);
      }

      // 3. Soft Constraint: Consecutive Weekends
      if (isFriSatSun(date)) {
        let freshWeekendCandidates = candidates.filter(r => !workedLastWeekend(date, r.id));
        if (freshWeekendCandidates.length > 0) {
          candidates = freshWeekendCandidates;
        }
      }

      if (candidates.length === 0) {
        newSchedule[dateStr] = null;
        return;
      }

      // 4. Sort by Total Shifts
      candidates = shuffle(candidates).sort((a, b) => {
        return stats[a.id].total - stats[b.id].total;
      });

      const chosen = candidates[0];
      newSchedule[dateStr] = chosen.id;
      stats[chosen.id].total++;
    });

    setSchedule(newSchedule);
    setView('calendar');
  };

  const handlePrint = () => {
    // Add a small timeout to allow UI updates (ripples, etc) to finish before blocking thread
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const downloadICal = (riderId) => {
    const rider = getRiderById(riderId);
    if (!rider) return;

    let icalContent =
      `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Stable Scheduler//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
`;

    Object.entries(schedule).forEach(([dateStr, scheduledRiderId]) => {
      if (scheduledRiderId === riderId) {
        const dateFormatted = formatICalDate(dateStr);
        // Ensure newlines are properly escaped for iCal format
        const safeDescription = eventDescription.replace(/\n/g, '\\n');
        icalContent +=
          `BEGIN:VEVENT
DTSTART;VALUE=DATE:${dateFormatted}
DTEND;VALUE=DATE:${dateFormatted}
SUMMARY:${eventName}
DESCRIPTION:${safeDescription}
STATUS:CONFIRMED
END:VEVENT
`;
      }
    });

    icalContent += `END:VCALENDAR`;

    const blob = new Blob([icalContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${rider.name.replace(/\s+/g, '_')}_schedule.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateScheduleHTML = () => {
    const dates = generateDates(config.startDate, config.endDate);

    // Group by month for display
    const months = {};
    dates.forEach(date => {
      const key = getMonthName(date);
      if (!months[key]) months[key] = [];
      months[key].push(date);
    });

    let htmlRows = '';

    Object.entries(months).forEach(([monthName, monthDates]) => {
      htmlRows += `<tr style="background-color: #f3f4f6;"><td colspan="3" style="font-weight: bold; padding: 10px; font-size: 1.1em;">${monthName}</td></tr>`;
      monthDates.forEach(date => {
        const dateStr = formatDate(date);
        const riderId = schedule[dateStr];
        const rider = getRiderById(riderId);
        const isWknd = isWeekendDay(date);

        const rowBg = isWknd ? '#fafafa' : '#ffffff';
        const dateColor = isWknd ? '#dc2626' : '#374151'; // red for weekend dates text

        htmlRows += `
          <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px; color: ${dateColor};">${dateStr}</td>
            <td style="padding: 8px; color: #6b7280;">${date.toLocaleDateString('nb-NO', { weekday: 'long' })}</td>
            <td style="padding: 8px; font-weight: ${rider ? 'bold' : 'normal'};">
              ${rider ? `<span style="color: #059669;">${rider.name}</span>` : '<span style="color: #dc2626;">Ikke tildelt</span>'}
            </td>
          </tr>
        `;
      });
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          h1 { color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { text-align: left; background: #059669; color: white; padding: 10px; }
          td { padding: 8px; }
        </style>
      </head>
      <body>
        <h1>Stallvaktplan</h1>
        <p>Her er den oppdaterte oversikten.</p>
        <table>
          <thead>
            <tr>
              <th>Dato</th>
              <th>Dag</th>
              <th>Ansvarlig</th>
            </tr>
          </thead>
          <tbody>
            ${htmlRows}
          </tbody>
        </table>
      </body>
      </html>
    `;
  };

  const downloadEML = (riderId) => {
    const rider = getRiderById(riderId);
    if (!rider) return;

    // 1. Generate iCal Content
    let icalContent =
      `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Stable Scheduler//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
`;
    Object.entries(schedule).forEach(([dateStr, scheduledRiderId]) => {
      if (scheduledRiderId === riderId) {
        const dateFormatted = formatICalDate(dateStr);
        const safeDescription = eventDescription.replace(/\n/g, '\\n');
        icalContent +=
          `BEGIN:VEVENT
DTSTART;VALUE=DATE:${dateFormatted}
DTEND;VALUE=DATE:${dateFormatted}
SUMMARY:${eventName}
DESCRIPTION:${safeDescription}
STATUS:CONFIRMED
END:VEVENT
`;
      }
    });
    icalContent += `END:VCALENDAR`;

    // 2. Generate HTML Content
    const htmlContent = generateScheduleHTML();

    // 3. Construct EML
    const boundary = "boundary_stallvakt_plan_12345";
    const toEmail = ""; // We don't have email stored, user can fill in
    const subject = `Stallvaktplan - ${rider.name}`;
    const bodyText = `Hei ${rider.name},\n\nHer er din oversikt for stallvakt. Se vedlagt kalenderfil (.ics) og full oversikt (.html).`;

    const emlContent = `MIME-Version: 1.0
To: ${toEmail}
Subject: ${subject}
X-Unsent: 1
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: text/plain; charset="utf-8"
Content-Transfer-Encoding: 8bit

${bodyText}

--${boundary}
Content-Type: text/calendar; charset="utf-8"; method=REQUEST; name="stallvakt.ics"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="stallvakt.ics"

${btoa(unescape(encodeURIComponent(icalContent)))}

--${boundary}
Content-Type: text/html; charset="utf-8"; name="stallvaktplan.html"
Content-Transfer-Encoding: base64
Content-Disposition: attachment; filename="stallvaktplan.html"

${btoa(unescape(encodeURIComponent(htmlContent)))}

--${boundary}--`;

    const blob = new Blob([emlContent], { type: 'message/rfc822;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Stallvakt_${rider.name}.eml`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Handlers ---

  const addRider = () => {
    const id = Date.now();
    const colors = [
      'bg-blue-100 text-blue-800 border-blue-200',
      'bg-green-100 text-green-800 border-green-200',
      'bg-purple-100 text-purple-800 border-purple-200',
      'bg-orange-100 text-orange-800 border-orange-200',
      'bg-pink-100 text-pink-800 border-pink-200',
      'bg-teal-100 text-teal-800 border-teal-200',
    ];
    setRiders([...riders, {
      id,
      name: `Rytter ${riders.length + 1}`,
      color: colors[riders.length % colors.length],
      blockedDates: []
    }]);
  };

  const removeRider = (id) => {
    setRiders(riders.filter(r => r.id !== id));
  };

  const updateRider = (id, field, value) => {
    setRiders(riders.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const toggleBlockedDate = (e, riderId, dateStr) => {
    // Prevent default to avoid scroll jumping or form submission behavior
    if (e) e.preventDefault();

    const rider = riders.find(r => r.id === riderId);
    if (!rider) return;

    const isBlocked = rider.blockedDates.includes(dateStr);

    const newBlocked = isBlocked
      ? rider.blockedDates.filter(d => d !== dateStr)
      : [...rider.blockedDates, dateStr];

    updateRider(riderId, 'blockedDates', newBlocked);
  };

  const manualAssign = (dateStr) => {
    const currentId = schedule[dateStr];

    // Filter riders who have NOT blocked this date
    const availableRiders = riders.filter(r => !r.blockedDates.includes(dateStr));

    // Create a cycle list: [Rider1, Rider2, ..., null]
    // We include null to allow unassigning
    const cycleList = [...availableRiders.map(r => r.id), null];

    const currentIndex = cycleList.indexOf(currentId);

    // Calculate next index, wrapping around if necessary
    const nextIndex = (currentIndex + 1) % cycleList.length;
    const nextId = cycleList[nextIndex];

    setSchedule({ ...schedule, [dateStr]: nextId });
  };

  const getRiderById = (id) => riders.find(r => r.id === id);

  // --- Render Helpers ---
  // Defined as plain functions to prevent React from unmounting/remounting (which caused scroll reset)

  const renderSetupView = () => (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in">

      {/* Header */}
      <div className="text-center py-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Stallvaktplan</h1>
        <p className="text-gray-600">Planlegg rettferdige vaktlister for stallen.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Configuration Panel */}
        <div className="md:col-span-1 space-y-6">
          <Card title="Innstillinger">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Startdato</label>
                <input
                  type="date"
                  value={config.startDate}
                  onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sluttdato</label>
                  <input
                    type="date"
                    value={config.endDate}
                    min={config.startDate}
                    onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hendelsesnavn (for kalender)</label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Stallvakt"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivelse</label>
                <textarea
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  rows={2}
                  placeholder="Detaljer om vakten..."
                />
              </div>
              <Button onClick={generateSchedule} className="w-full justify-center mt-4">
                <CalendarIcon size={18} /> Generer Vaktliste
              </Button>
            </div>
          </Card>

          <Card title="Statistikk">
            <div className="text-sm text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>Ryttere:</span>
                <span className="font-medium">{riders.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Totale dager:</span>
                <span className="font-medium">{generateDates(config.startDate, config.endDate).length}</span>
              </div>
              <div className="p-3 bg-blue-50 text-blue-800 rounded-md text-xs mt-4">
                Tips: Klikk på tannhjulet på en rytter for å sette "Unngå datoer" eller blokkere spesifikke dager som ferier.
              </div>
            </div>
          </Card>
        </div>

        {/* Riders List */}
        <div className="md:col-span-2">
          <Card title="Administrer Ryttere" className="h-full">
            <div className="space-y-3">
              {riders.map((rider) => (
                <div key={rider.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 group">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold ${rider.color.split(' ')[0]} ${rider.color.split(' ')[1]}`}>
                    {rider.name.charAt(0)}
                  </div>

                  <div className="flex-1">
                    <input
                      type="text"
                      value={rider.name}
                      onChange={(e) => updateRider(rider.id, 'name', e.target.value)}
                      className="bg-transparent font-medium text-gray-800 focus:bg-white focus:px-2 focus:py-1 focus:ring-2 focus:ring-emerald-500 rounded outline-none w-full"
                    />
                    <div className="flex gap-4 text-xs text-gray-500 mt-1">
                      <button
                        type="button"
                        onClick={() => setActiveRiderId(rider.id)}
                        className="flex items-center gap-1 hover:text-blue-600"
                      >
                        <CalendarIcon size={12} />
                        {rider.blockedDates.length} blokkerte datoer
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveRiderId(rider.id)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                    title="Konfigurer Tilgjengelighet"
                  >
                    <Settings size={18} />
                  </button>

                  <button
                    type="button"
                    onClick={() => removeRider(rider.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    title="Fjern Rytter"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}

              <Button variant="secondary" onClick={addRider} className="w-full justify-center border-dashed border-2">
                <Plus size={18} /> Legg til Ny Rytter
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Constraints Modal */}
      {activeRiderId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold">
                Tilgjengelighet: {getRiderById(activeRiderId)?.name}
              </h3>
              <button type="button" onClick={() => setActiveRiderId(null)}><X size={24} className="text-gray-400 hover:text-gray-600" /></button>
            </div>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-500">
                  Velg datoer som skal blokkeres (ferier, osv).
                </p>
                <span className="text-sm font-medium px-2 py-1 rounded bg-blue-100 text-blue-700">
                  {getRiderById(activeRiderId)?.blockedDates.length} dager blokkert
                </span>
              </div>

              {/* Grouped Month View for Selection */}
              <div className="space-y-6">
                {Object.entries(
                  generateDates(config.startDate, config.endDate).reduce((acc, date) => {
                    const key = getMonthName(date);
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(date);
                    return acc;
                  }, {})
                ).map(([monthName, monthDates]) => (
                  <div key={monthName}>
                    <h4 className="font-semibold text-gray-800 mb-2 border-b border-gray-100 pb-1">{monthName}</h4>
                    <div className="grid grid-cols-7 gap-1">
                      {['M', 'T', 'O', 'T', 'F', 'L', 'S'].map((d, i) => (
                        <div key={i} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>
                      ))}

                      {/* Empty slots for start of month alignment (Monday start) */}
                      {Array.from({ length: (monthDates[0].getDay() + 6) % 7 }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}

                      {monthDates.map(date => {
                        const dStr = formatDate(date);
                        const isBlocked = getRiderById(activeRiderId)?.blockedDates.includes(dStr);
                        const dayNum = date.getDate();

                        return (
                          <button
                            type="button"
                            key={dStr}
                            onClick={(e) => toggleBlockedDate(e, activeRiderId, dStr)}
                            className={`
                                aspect-square text-sm rounded-md flex items-center justify-center transition-all
                                ${isBlocked
                                ? 'bg-red-100 text-red-700 font-bold border border-red-200'
                                : 'hover:bg-gray-100 text-gray-700'}
                                ${isWeekendDay(date) && !isBlocked ? 'bg-gray-50' : ''}
                              `}
                          >
                            {dayNum}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 bg-gray-50 text-right sticky bottom-0 border-t border-gray-100">
              <Button onClick={() => setActiveRiderId(null)}>Ferdig</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderCalendarView = () => {
    const dates = generateDates(config.startDate, config.endDate);

    // Group dates by month
    const months = {};
    dates.forEach(date => {
      const key = getMonthName(date);
      if (!months[key]) months[key] = [];
      months[key].push(date);
    });

    // Calculate fairness stats for display
    const stats = {};
    riders.forEach(r => stats[r.id] = { total: 0, saturdays: 0 });
    Object.entries(schedule).forEach(([dateStr, riderId]) => {
      if (riderId && stats[riderId]) {
        stats[riderId].total++;
        const date = new Date(dateStr);
        if (isSaturday(date)) stats[riderId].saturdays++;
      }
    });

    return (
      <div className="max-w-6xl mx-auto">
        {/* Toolbar - Hidden when printing */}
        <div className="mb-8 flex flex-wrap gap-4 items-center justify-between no-print bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <Button variant="secondary" onClick={() => setView('setup')}>
            <User size={18} /> Rediger Ryttere
          </Button>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={generateSchedule} title="Re-roll logic">
              <RefreshCw size={18} /> Generer på nytt
            </Button>
            <Button onClick={handlePrint}>
              <Printer size={18} /> Skriv ut Plan
            </Button>
          </div>
        </div>

        {/* Stats Summary - Hidden when printing */}
        <div className="mb-8 no-print">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Rettferdighetssjekk (Lørdager prioritert)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {riders.map(r => (
              <div key={r.id} className="bg-white p-3 rounded-lg border border-gray-200 text-sm flex flex-col justify-between">
                <div>
                  <div className="font-bold text-gray-800">{r.name}</div>
                  <div className="flex justify-between text-gray-500 mt-1">
                    <span>Totalt: {stats[r.id].total}</span>
                    <span className="font-bold text-emerald-700">Lør: {stats[r.id].saturdays}</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => downloadICal(r.id)}
                    className="w-full py-1.5 bg-gray-50 hover:bg-emerald-50 text-gray-600 hover:text-emerald-700 rounded border border-gray-200 hover:border-emerald-200 flex items-center justify-center gap-1.5 transition-colors text-xs font-medium"
                    title={`Last ned .ics kalender for ${r.name}`}
                  >
                    <Download size={14} /> Last ned iCal
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadEML(r.id)}
                    className="w-full py-1.5 bg-white hover:bg-gray-50 text-gray-600 hover:text-blue-700 rounded border border-gray-200 hover:border-blue-200 flex items-center justify-center gap-1.5 transition-colors text-xs font-medium"
                    title={`Last ned e-post kladd for ${r.name}`}
                  >
                    <Mail size={14} /> Last ned E-post
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* The Calendars */}
        <div className="space-y-12 print:space-y-0">
          {Object.entries(months).map(([monthName, monthDates]) => (
            <div key={monthName} className="break-after-page bg-white p-8 rounded-xl shadow-sm border border-gray-200 print:shadow-none print:border-none print:p-0 print:h-screen print:flex print:flex-col print:overflow-hidden">
              <div className="flex justify-between items-end mb-6 border-b-2 border-emerald-600 pb-2 print:mb-2">
                <h2 className="text-3xl font-bold text-gray-800 uppercase tracking-tight print:text-2xl">{monthName}</h2>
                <span className="text-sm text-gray-500 font-medium no-print">Klikk på en dag for å bytte person</span>
              </div>

              {/* Flex wrapper for the grid to ensure full page height usage in print */}
              <div className="flex flex-col bg-gray-200 border border-gray-200 print:flex-1 print:border-gray-300">
                {/* Header Row */}
                <div className="grid grid-cols-7 gap-px bg-gray-200 border-b border-gray-200 print:border-gray-300">
                  {['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'].map(day => (
                    <div key={day} className="bg-gray-50 p-2 text-center text-xs font-bold uppercase text-gray-500 tracking-wider print:py-1 print:text-[10px]">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Days Grid - Expands to fill available space */}
                <div className="grid grid-cols-7 gap-px bg-gray-200 flex-1 auto-rows-fr print:bg-gray-300">
                  {/* Empty cells for start of month (Monday start) */}
                  {Array.from({ length: (monthDates[0].getDay() + 6) % 7 }).map((_, i) => (
                    <div key={`empty-${i}`} className="bg-white min-h-[120px] print:min-h-0" />
                  ))}

                  {/* Days */}
                  {monthDates.map(date => {
                    const dateStr = formatDate(date);
                    const riderId = schedule[dateStr];
                    const rider = getRiderById(riderId);

                    return (
                      <div
                        key={dateStr}
                        onClick={() => manualAssign(dateStr)}
                        className={`
                            bg-white min-h-[120px] p-2 relative group cursor-pointer hover:bg-gray-50 transition-colors
                            print:min-h-0 print:h-auto print:p-1
                            ${isWeekendDay(date) ? 'bg-gray-50/50' : ''}
                        `}
                      >
                        <span className={`
                            inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium
                            ${dateStr === formatDate(new Date()) ? 'bg-emerald-600 text-white' : 'text-gray-500'}
                            print:w-5 print:h-5 print:text-[10px]
                        `}>
                          {date.getDate()}
                        </span>

                        <div className="mt-2 h-full print:mt-1">
                          {rider ? (
                            <div className={`
                                    p-2 rounded-md text-sm font-semibold border shadow-sm
                                    ${rider.color}
                                    print:p-1 print:text-xs print:border-gray-300 print:shadow-none
                                `}>
                              {rider.name}
                            </div>
                          ) : (
                            <div className="p-2 rounded-md text-sm font-medium border border-red-200 bg-red-50 text-red-600 flex items-center gap-1 print:p-1 print:text-xs">
                              <AlertCircle size={14} className="print:w-3 print:h-3" /> <span className="print:hidden">Ikke tildelt</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Fill remaining empty cells for the last row so it renders borders correctly */}
                  {Array.from({ length: (7 - (monthDates[0].getDay() + 6 + monthDates.length) % 7) % 7 }).map((_, i) => (
                    <div key={`empty-end-${i}`} className="bg-white min-h-[120px] print:min-h-0" />
                  ))}
                </div>
              </div>

              <div className="mt-4 text-xs text-gray-400 text-right print:block hidden">
                Generert av Stallvaktplan
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20">
      <div className="p-4 md:p-8">
        {view === 'setup' ? renderSetupView() : renderCalendarView()}
      </div>

      {/* Print Styles Injection */}
      <style>{`
        @media print {
          @page { 
            size: A4 landscape;
            margin: 0;
          }
          body { 
            background: white; 
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          /* Reset app shell spacing */
          .min-h-screen, .p-4, .md\\:p-8, .pb-20, .max-w-6xl {
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: none !important;
            width: 100% !important;
            overflow: visible !important;
          }

          .no-print { display: none !important; }
          
          .break-after-page { 
            height: 100vh;
            width: 100vw;
            page-break-after: always; 
            break-after: page; 
            margin: 0 !important;
            padding: 10mm !important; /* Controlled padding acts as margin */
            box-sizing: border-box;
            display: flex !important;
            flex-direction: column;
            overflow: hidden; /* Clip spills */
          }

          /* Force background colors */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
    </div>
  );
}