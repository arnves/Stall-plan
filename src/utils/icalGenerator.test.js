import { describe, it, expect } from 'vitest';
import { generateICalContent } from './icalGenerator';

describe('generateICalContent', () => {
    const mockEvents = [
        {
            date: '2023-10-01',
            riderId: 1,
            name: 'Elin',
            eventName: 'Stallvakt',
            description: 'Stallvakt for Elin.\nHusk å fôre hestene.'
        },
        {
            date: '2023-10-08',
            riderId: 1,
            name: 'Elin',
            eventName: 'Stallvakt',
            description: 'Stallvakt igjen.'
        }
    ];

    it('generates a valid VCALENDAR structure', () => {
        const ical = generateICalContent(mockEvents);
        expect(ical).toContain('BEGIN:VCALENDAR');
        expect(ical).toContain('VERSION:2.0');
        expect(ical).toContain('PRODID:-//Stable Scheduler//EN');
        expect(ical).toContain('END:VCALENDAR');
    });

    it('generates VEVENT for each event', () => {
        const ical = generateICalContent(mockEvents);
        const events = ical.match(/BEGIN:VEVENT/g);
        expect(events).toHaveLength(2);
    });

    it('formats DTSTART correctly', () => {
        const ical = generateICalContent([mockEvents[0]]);
        expect(ical).toContain('DTSTART;VALUE=DATE:20231001');
    });

    it('formats DTEND as the next day for all-day events', () => {
        const ical = generateICalContent([mockEvents[0]]);
        // 2023-10-01 + 1 day = 2023-10-02
        expect(ical).toContain('DTEND;VALUE=DATE:20231002');
    });

    it('generates a unique UID', () => {
        const ical = generateICalContent([mockEvents[0]]);
        expect(ical).toMatch(/UID:.*@stablescheduler/);
    });

    it('includes a valid DTSTAMP', () => {
        const ical = generateICalContent([mockEvents[0]]);
        // Matches YYYYMMDDTHHMMSSZ
        expect(ical).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    });

    it('escapes special characters in description', () => {
        const ical = generateICalContent([mockEvents[0]]);
        // Newlines should be escaped as \\n
        expect(ical).toContain('DESCRIPTION:Stallvakt for Elin.\\nHusk å fôre hestene.');
    });

    it('folds long lines', () => {
        const longDescEvent = {
            date: '2023-10-01',
            riderId: 1,
            name: 'test',
            eventName: 'Test',
            description: 'A'.repeat(100)
        };
        const ical = generateICalContent([longDescEvent]);
        const lines = ical.split('\r\n');
        // Ensure no line is longer than 75 characters (octet length approximation)
        const longLines = lines.filter(line => line.length > 75);
        expect(longLines).toHaveLength(0);
    });

    it('handles empty events list', () => {
        const ical = generateICalContent([]);
        expect(ical).toContain('BEGIN:VCALENDAR');
        expect(ical).toContain('END:VCALENDAR');
        expect(ical).not.toContain('BEGIN:VEVENT');
    });
});
