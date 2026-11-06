'use client';
import { Icon } from '../ui/Icon.jsx';

/** Under the front look, and down the side of the full-screen viewer: hide, favourite, worn today (Figma 191:1376,
 *  253:8207). Large Tertiary icon-buttons, 4px apart. Favourite fills with bg/accent-light; worn turns gold. */
export function LookActions({ onHide, hiding = false, favorite, onFavorite, worn, onWear, children, className = '' }) {
  return (
    <div className={('mirror-look-buttons ' + className).trim()}>
      <button type="button" className={'ds-icon-button is-large is-tertiary mirror-look-action is-hide' + (hiding ? ' is-hiding' : '')} onClick={onHide} disabled={hiding}
        aria-label="Hide this look" title="Hide this look"><Icon name="eye-off" size={24} strokeWidth={5 / 3} /></button>
      <button type="button" className="ds-icon-button is-large is-tertiary mirror-look-action" onClick={onFavorite}
        aria-pressed={favorite} aria-label="Favorite" title={favorite ? 'Remove from Favorites' : 'Save to Favorites'}>
        <Icon name="heart" size={24} strokeWidth={5 / 3} /></button>
      <button type="button" className="ds-icon-button is-large is-tertiary mirror-look-action is-wear" onClick={onWear}
        aria-pressed={worn} aria-label="I wore this today" title={worn ? 'Not worn today' : 'I wore this today'}>
        <Icon name="award" size={24} strokeWidth={5 / 3} /></button>
      {children}
    </div>
  );
}
