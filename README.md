Stable Scheduler

A React-based application designed to automate and manage fair duty rosters for horse stables. This application handles complex constraints such as fairness balancing, weekend rotation, and blocked dates to generate printable, A4-optimized schedules.

🎯 Purpose

The primary goal is to eliminate the manual complexity of creating a fair roster. The system prioritizes "Saturday" fairness (often the most contested shift) and ensures no single rider is overburdened with consecutive shifts or consecutive weekends, while respecting individual time-off requests.

🛠 Tech Stack

Framework: React 18+

Styling: Tailwind CSS (Utility-first styling)

Icons: Lucide React

Build Tool: Vite / Create React App (Standard React environment)

Export: Built-in iCal (.ics) generation and native Print API optimization.

🏗 Architecture

The application is currently structured as a Single File Component (StableScheduler.jsx) to maximize portability and ease of compilation in lightweight environments.

Core State

The application state is managed via useState hooks at the top level of the App component:

riders: Array of objects.

{
  id: number,
  name: string,
  color: string, // Tailwind classes
  blockedDates: string[] // ["YYYY-MM-DD", ...]
}


schedule: A flat dictionary mapping dates to rider IDs.

{ "2023-10-01": 1, "2023-10-02": 2 }


config: Settings for generation duration and start date.

view: Toggles between 'setup' (configuration) and 'calendar' (generated view).

🧠 The Scheduling Algorithm

The core logic is a 2-Pass Greedy Algorithm with backtracking-lite (shuffle/sort) heuristics. It is located in the generateSchedule function.

Pass 1: The Anchor Days (Saturdays)

Saturdays are treated as high-priority "Anchor" days because they are often the most labor-intensive or socially valuable.

Filter: Identify all Saturdays in the range.

Availability: Filter riders who have not blocked this specific date.

Soft Constraint: Avoid the rider who worked the previous Saturday.

Heuristic Sort: Sort candidates primarily by total Saturdays worked (ascending), then by total shifts (ascending).

Assign: Pick the top candidate.

Pass 2: The Fill (Weekdays & Sundays)

Once Saturdays are locked in, the algorithm fills the remaining days.

Hard Constraint (Consecutive Days): Filter out riders assigned to date - 1 (Yesterday) or date + 1 (Tomorrow).

Note: Tomorrow might be assigned if it was a Saturday handled in Pass 1.

Soft Constraint (Consecutive Weekends): If the current day is Fri/Sat/Sun, check if the rider worked the previous weekend. If so, deprioritize them.

Heuristic Sort: Sort candidates by total shifts to ensure overall fairness.

🧩 Key Components

1. renderSetupView

The entry point. Contains:

Configuration Panel: Start date, duration selectors.

Rider Management: Add/Remove riders, assign colors.

Constraints Modal: A calendar grid allowing users to click specific dates to add them to a rider's blockedDates array.

2. renderCalendarView

The output view.

Stats Dashboard: Displays total shifts vs. Saturday shifts per rider.

Grid System: A responsive grid that switches to a strict A4 landscape layout during printing.

Manual Overrides: Clicking a day in the calendar cycles through available riders manually, updating the schedule state directly.

3. Print Optimization

The app uses a specific <style> block injected at runtime to handle printing:

@page { size: landscape; margin: 0; }: Resets browser defaults.

.break-after-page: Forces a CSS page break after every month.

min-height adjustments: Ensures the grid fills the physical paper size without overflowing.

🚀 Developer Guide

Setup

Ensure Node.js is installed.

Clone the repository.

Install dependencies:

npm install lucide-react tailwindcss


Run the development server.

extending the Logic

To add new constraints (e.g., "Rider A cannot work with Rider B" or "Fridays are half-days"), modify the generateSchedule function.

Example: Adding a "No Fridays" preference

Add a noFridays boolean to the rider object.

In Pass 2, inside the loop, add a filter:

if (isFriday(date)) {
  candidates = candidates.filter(r => !r.noFridays);
}


UI Customization

The grid relies on Tailwind's grid-cols-7. If moving to a different calendar system (e.g., list view), you will need to refactor the renderCalendarView render loop.

📄 License

Undecided