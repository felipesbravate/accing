// Feather icons (feather-icons package, github.com/feathericons/feather). They stroke with currentColor, so their
// colour comes from the surrounding token, e.g. `color: var(--icon-primary)`.
import feather from 'feather-icons';

// Thread's own clothing icons (24px, 2px stroke), exported from Figma 2026-11-06: the wardrobe categories.
const THREAD = {
 "t-shirt": "<path d=\"M6 3H8.25C8.25 6.9 15.75 6.9 15.75 3H18L21.75 6.75L18.75 10.5L16.5 9V21H7.5V9L5.25 10.5L2.25 6.75L6 3Z\"/>",
 "chinos": "<path d=\"M18 3H6L5.25 21H9.75L12 10.5L14.25 21H18.75L18 3Z\"/>",
 "dress": "<path d=\"M7.5 3H9C9 6 15 6 15 3H16.5L18 7.5L15 10.5L20.25 21H3.75L9 10.5L6 7.5L7.5 3Z\"/>",
 "skirt": "<path d=\"M16.5 3H7.5L3 21H21L16.5 3Z\"/>",
 "shorts": "<path d=\"M18.75 4.5H5.25L3.75 18.75H10.5L12 12L13.5 18.75H20.25L18.75 4.5Z\"/>",
 "polo-shirt": "<path d=\"M6 3H8.25L12 7.5L15.75 3H18L21.75 6.75L18.75 10.5L16.5 9V21H7.5V9L5.25 10.5L2.25 6.75L6 3Z\"/>",
 "sweater": "<path d=\"M6 3H8.25C8.25 6.9 15.75 6.9 15.75 3H18L21.75 18L18 18.75L16.5 10.5V21H7.5V10.5L6 18.75L2.25 18L6 3Z\"/>",
 "bomber-jacket": "<path d=\"M12 6V21M9 3H6.75C4.75 4 3.25 9 2.25 18L6 18.75L7.5 10.5V18L8.25 21H15.75L16.5 18V10.5L18 18.75L21.75 18C20.75 9 19.25 4 17.25 3H15C15 6.75 9 6.75 9 3Z\"/>",
 "winter-coat": "<path d=\"M12 6.71302V21.0005M7.5 14.213H16.5M7.5 5.21302C7.5 1.21252 16.5 1.21252 16.5 5.21302L18.75 5.96302L21.75 17.213L18 17.963L16.5 11.213V21.0005H7.5V11.213L6 17.963L2.25 17.213L5.25 5.96302L7.5 5.21302Z\"/>",
 "sneakers": "<path d=\"M9.45 11.9999L10.95 10.4999M12 13.9499L13.5 12.4499M2.25 9.74989L4.2 10.7999C5.2 11.3999 6.88882 11.4999 7.48882 10.4999C7.48882 10.4999 8.4 8.39989 9 8.24989C9.6 8.09989 14.25 12.7499 14.25 12.7499C15.5906 13.7075 17.6218 13.7492 19.2 14.0999C20.9 14.4999 21.75 15.5499 21.75 17.2499V19.4999H2.25V9.74989Z\"/><path d=\"M2.25 16.8H21.75\"/>",
 "dress-shoes": "<path d=\"M12 12.75L9 9.75L7.95 10.5C5.95 11.8 4.05 11.8 2.25 10.5V19.5H7.5V17.25L9.75 19.2H21.75C21.75 15.3258 19.8 14.4 16.5 13.95C14.5183 13.6798 13 13.55 12 12.75ZM12 12.75L10.8 15\"/>",
 // The medal of "worn today" (Thread outfit-actions 246:498, from Felipe's award_filled.svg, 2026-11-06): Feather's award
 // with the ribbon drawn first and the circle over it, so when filled the circle covers the ribbon's top.
 // Its glow is the file's own filter (a #FFBB00 shadow, stdDeviation 12, on each shape), switched on by CSS when worn.
 "award": "<defs><filter id=\"award-glow\" filterUnits=\"userSpaceOnUse\" x=\"-30\" y=\"-30\" width=\"84\" height=\"84\" color-interpolation-filters=\"sRGB\"><feGaussianBlur in=\"SourceAlpha\" stdDeviation=\"12\"/><feComposite in2=\"SourceAlpha\" operator=\"out\"/><feColorMatrix type=\"matrix\" values=\"0 0 0 0 1 0 0 0 0 0.733333 0 0 0 0 0 0 0 0 1 0\" result=\"glow\"/><feBlend mode=\"normal\" in=\"SourceGraphic\" in2=\"glow\"/></filter></defs><path d=\"M8.21 13.89L7 23L12 20L17 23L15.79 13.88\"/><path d=\"M12 15C15.866 15 19 11.866 19 8C19 4.134 15.866 1 12 1C8.134 1 5 4.134 5 8C5 11.866 8.134 15 12 15Z\"/>",
 "high-heels": "<path d=\"M2.25 10.5V4.5C5.25 9 7.5 12 11.25 12L14.25 9L22.95 19.2H15.75C10.3686 19.2 11.25 18 2.25 10.5ZM2.25 10.5V19.5\"/>"
};

/** strokeWidth is in the 24-unit viewBox: 2 is Feather's own; Figma's 24px slots hold 20px icons scaled up (1.67). */
export function Icon({ name, size = 24, label, className = '', strokeWidth = 2 }) {
  const icon = THREAD[name] ? { contents: THREAD[name] } : feather.icons[name];
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
