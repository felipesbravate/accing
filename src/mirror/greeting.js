// "Monday, Oct 26 / 08:00" and "What's your vibe this Monday, Juliana?" (tested in tests/greeting.test.js).
export function dateLine(date, locale = 'en-US') {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
  const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return `${weekday}, ${day} / ${time}`;
}

export function vibeQuestion(date, name, locale = 'en-US') {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
  return name ? `What's your vibe this ${weekday}, ${name}?` : `What's your vibe this ${weekday}?`;
}
