
// Helper to escape text characters
const escapeText = (text) => {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/\;/g, '\\;')
        .replace(/\,/g, '\\,')
        .replace(/\n/g, '\\n');
};

// Helper to fold lines at 75 octets
const foldLine = (line) => {
    if (line.length <= 75) return line;

    // RFC 5545: Lines of text SHOULD NOT be longer than 75 octets, excluding the line break.
    // Long content lines SHOULD be split into a multiple line representations using a line "folding" technique.
    // That is, a long line can be split between any two characters by inserting a CRLF immediately followed by a single linear white-space character (i.e., SPACE or HTAB).

    let result = '';
    let remaining = line;

    // First line 75 chars
    result += remaining.substring(0, 75);
    remaining = remaining.substring(75);

    // Subsequent lines: space + 74 chars = 75 chars
    while (remaining.length > 0) {
        result += '\r\n ' + remaining.substring(0, 74);
        remaining = remaining.substring(74);
    }

    return result;
};

export const generateICalContent = (events) => {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    let content = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Stable Scheduler//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ].join('\r\n'); // Use CRLF explicitly for join? Or just one big string with \r\n everywhere.
    // Actually, let's build an array of lines and join them later.

    // Wait, I should implement the content logic first.

    events.forEach(event => {
        // DTSTART
        const startDate = event.date.replace(/-/g, '');

        // DTEND (Next day for all-day events)
        const d = new Date(event.date);
        d.setDate(d.getDate() + 1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const endDate = `${year}${month}${day}`;

        // UID
        const uid = `${event.date}-${event.riderId}@stablescheduler`;

        const description = escapeText(event.description);

        const eventLines = [
            'BEGIN:VEVENT',
            `DTSTART;VALUE=DATE:${startDate}`,
            `DTEND;VALUE=DATE:${endDate}`,
            `DTSTAMP:${timestamp}`,
            `UID:${uid}`,
            `SUMMARY:${escapeText(event.eventName)}`,
            `DESCRIPTION:${description}`,
            'STATUS:CONFIRMED',
            'END:VEVENT'
        ];

        // Add to content with proper folding
        content += '\r\n' + eventLines.map(foldLine).join('\r\n');
    });

    content += '\r\nEND:VCALENDAR';
    return content;
};
