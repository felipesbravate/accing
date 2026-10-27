// Greeting text for the Daily Mirror (tested in tests/greeting.test.js).
// Desktop shows "Monday, Oct 26 / 08:00" on one line; mobile stacks "Monday, Oct 26" and "08:00".
export function dayLine(date, locale = 'en-US') {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
  const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
  return `${weekday}, ${day}`;
}

export function timeLine(date) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function dateLine(date, locale = 'en-US') {
  return `${dayLine(date, locale)} / ${timeLine(date)}`;
}

export function vibeQuestion(date, name, locale = 'en-US') {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
  return name ? `What's your vibe this ${weekday}, ${name}?` : `What's your vibe this ${weekday}?`;
}
