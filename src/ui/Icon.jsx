// Feather icons (feather-icons package, github.com/feathericons/feather). They stroke with currentColor, so their
// colour comes from the surrounding token, e.g. `color: var(--icon-primary)`.
import feather from 'feather-icons';

export function Icon({ name, size = 24, label, className = '' }) {
  const icon = feather.icons[name];
  if (!icon) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={('icon ' + className).trim()}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: icon.contents }}
    />
  );
}
