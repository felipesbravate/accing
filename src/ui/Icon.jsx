// Feather icons (feather-icons package, github.com/feathericons/feather). They stroke with currentColor, so their
// colour comes from the surrounding token, e.g. `color: var(--icon-primary)`.
import feather from 'feather-icons';

/** strokeWidth is in the 24-unit viewBox: 2 is Feather's own; Figma's 24px slots hold 20px icons scaled up (1.67). */
export function Icon({ name, size = 24, label, className = '', strokeWidth = 2 }) {
  const icon = feather.icons[name];
  if (!icon) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={('icon ' + className).trim()}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: icon.contents }}
    />
  );
}
