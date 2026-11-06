'use client';
// Thread Design System pieces as React (styles in components.css): top-nav, Modal, text-field, Info-box, tag, label,
// checkbox, tile, spinner, mobile-menu, pager, toast. Each follows its Figma component; see the comments in components.css.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon.jsx';
import { dotsThatFit, pagerDots } from './pager.js';

/** top-nav (178:1363): back on the left (a Secondary 48px icon-button), an optional title, an optional right action. */
export function TopNav({ title, onBack, backLabel = 'Back', right = null, className = '' }) {
  return (
    <div className={('ds-top-nav ' + className).trim()}>
      <span className="ds-top-nav-side">
        {onBack && <button type="button" className="ds-icon-button is-large is-secondary" onClick={onBack} aria-label={backLabel}><Icon name="arrow-left" size={24} /></button>}
      </span>
      {title ? <h1 className="ds-top-nav-title">{title}</h1> : <span />}
      <span className="ds-top-nav-side is-end">{right}</span>
    </div>
  );
}

/** Modal (224:1421) with modal-top-nav (213:439): close on the right (and Escape, and a tap on the page behind),
 *  centred title and text, actions in a row. Slides up from the bottom when `open` turns true and back down when it
 *  turns false (it stays on screen, as it last was, until it's down). Focus moves to the panel while it's open. */
const MODAL_OUT_MS = 220;
export function Modal(props) {
  const { open = true } = props;
  const [shown, setShown] = useState(open);
  const last = useRef(props);
  if (open) last.current = props;
  useEffect(() => {
    if (open) { setShown(true); return undefined; }
    const t = setTimeout(() => setShown(false), MODAL_OUT_MS);
    return () => clearTimeout(t);
  }, [open]);
  if (!open && !shown) return null;
  return <ModalView {...last.current} closing={!open} />;
}

function ModalView({ title, description, children, onClose, closeLabel = 'Close', closing = false }) {
  const panel = useRef(null), titleId = useId(), textId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    const key = (e) => { if (e.key === 'Escape') close.current?.(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); before?.focus?.({ preventScroll: true }); };
  }, []);
  return (
    <div className={'ds-modal' + (closing ? ' is-closing' : '')} onClick={(e) => { if (e.target === e.currentTarget && !closing) onClose?.(); }}>
      <div ref={panel} tabIndex={-1} className="ds-modal-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? textId : undefined}>
        <div className="ds-modal-top">
          <span />
          {onClose && <button type="button" className="ds-icon-button is-secondary" onClick={onClose} aria-label={closeLabel} disabled={closing}><Icon name="x" size={20} /></button>}
        </div>
        <div className="ds-modal-info">
          <div className="ds-modal-text">
            <h2 id={titleId} className="ds-modal-title">{title}</h2>
            {description && <p id={textId} className="ds-modal-description">{description}</p>}
          </div>
          {children && <div className="ds-modal-actions">{children}</div>}
        </div>
      </div>
    </div>
  );
}

/** text-field (122:683). Password fields get the eye on the right to show what's typed. */
export function TextField({ label, unit, support, invalid = false, disabled = false, type = 'text', icon, className = '', ...input }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const password = type === 'password';
  return (
    <div className={['ds-field', disabled && 'is-disabled', invalid && 'is-invalid', className].filter(Boolean).join(' ')}>
      {label && <label className="ds-field-label" htmlFor={id}>{label}</label>}
      <div className="ds-field-box">
        {icon && <Icon name={icon} size={20} />}
        <input id={id} type={password && shown ? 'text' : type} disabled={disabled} aria-invalid={invalid || undefined}
          aria-describedby={support ? id + '-s' : undefined} placeholder={input.placeholder ?? ' '} {...input} />
        {unit && <span className="ds-field-unit">{unit}</span>}
        {password && (
          <button type="button" className="ds-field-icon" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
            <Icon name={shown ? 'eye' : 'eye-off'} size={20} strokeWidth={5 / 3} />
          </button>
        )}
      </div>
      {support && <p id={id + '-s'} className="ds-field-support">{support}</p>}
    </div>
  );
}

/** Info-box (201:348): Default, Danger or Warning; icon optional. */
export function InfoBox({ type = 'default', icon = 'info', title, children, className = '' }) {
  return (
    <div className={['ds-info', type !== 'default' && 'is-' + type, className].filter(Boolean).join(' ')} role={type === 'danger' ? 'alert' : undefined}>
      {icon && <Icon name={icon} size={20} strokeWidth={5 / 3} />}
      <div className="ds-info-body">
        {title && <p className="ds-info-title">{title}</p>}
        {children && <p className="ds-info-text">{children}</p>}
      </div>
    </div>
  );
}

/** tag (20:8): a toggle pill. */
export function Tag({ selected, onClick, small = false, disabled = false, children }) {
  return <button type="button" className={'ds-tag' + (small ? ' is-small' : '')} aria-pressed={selected} onClick={onClick} disabled={disabled}>{children}</button>;
}

/** label (187:1569): neutral, positive, negative or warning. */
export function Label({ type = 'neutral', small = false, children }) {
  return <span className={['ds-label', type !== 'neutral' && 'is-' + type, small && 'is-small'].filter(Boolean).join(' ')}>{children}</span>;
}

/** checkbox (122:658). */
export function Checkbox({ checked, onChange, children, ...input }) {
  return (
    <label className="ds-checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange?.(e.target.checked)} {...input} />
      <span className="ds-checkbox-box" aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} /></span>
      <span>{children}</span>
    </label>
  );
}

/** tile (183:1491): icon, label, sub-label. A link when href is given, else a button. */
export function Tile({ icon, label, sub, href, onClick }) {
  const inner = (<>{icon && <Icon name={icon} size={24} />}<span className="ds-tile-text"><span className="ds-tile-label">{label}</span>{sub && <span className="ds-tile-sub">{sub}</span>}</span></>);
  return href ? <Link className="ds-tile" href={href}>{inner}</Link> : <button type="button" className="ds-tile" onClick={onClick}>{inner}</button>;
}

/** spinner (220:634): the Accing symbol turning. */
export function Spinner({ label = 'Loading', className = '' }) {
  return (
    <svg className={('ds-spinner ' + className).trim()} viewBox="0 0 35 36" role="img" aria-label={label}>
      <path fill="currentColor" d="M0.629723 29.6162C0.343097 27.8213 -1.16517 18.7002 1.85433 19.1279C4.0051 19.4146 8.31542 20.2773 10.2547 21.3545C11.8338 22.2887 8.89043 23.5811 7.81234 24.874C12.9841 33.4947 27.2039 30.9808 29.4305 20.4951C29.7179 18.9863 32.5192 19.7764 33.453 19.7051C34.3864 19.6336 34.3866 20.2077 34.3866 20.4951C32.4487 34.8595 13.2714 40.9644 3.93441 28.0361C2.78498 28.8982 0.98929 31.4841 0.629723 29.6162ZM0.341637 13.5986C2.42484 -0.33265 19.5898 -4.35711 28.5672 5.26662C29.7881 4.04574 33.2359 1.24573 33.452 2.8965C33.5957 4.2618 35.4626 16.0406 32.3748 14.9639C30.1468 14.247 24.7617 14.1753 21.6737 12.1641C19.8782 11.014 23.6831 9.50692 24.6893 8.21388C21.0266 2.97068 7.59564 2.68314 4.79574 13.6006C4.65124 15.0364 2.13854 14.3172 1.27621 14.3906C0.34266 14.4629 0.270166 13.8875 0.341637 13.5986Z" />
    </svg>
  );
}

// Layout effect in the browser only (the server render has nothing to measure).
const useMeasure = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** mobile-menu (Thread 150:1019) of menu-item-mobile (95:592): a row of tabs as wide as their words, scrolling sideways
 *  when they don't fit, a 1px line under all and a 2px icon/primary bar under the chosen one, sliding to it. The chosen
 *  tab scrolls into view; the cut edge fades. items: [{ value, label }]. */
export function MobileMenu({ items, value, onChange, label }) {
  const scroller = useRef(null);
  const [bar, setBar] = useState(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const edgesOf = () => { const el = scroller.current; if (el) setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 }); };
  useMeasure(() => {
    const el = scroller.current, tab = el?.querySelector('[aria-selected="true"]');
    if (!tab) return undefined;
    const place = () => setBar({ left: tab.offsetLeft, width: tab.offsetWidth });
    place();
    const want = tab.offsetLeft - (el.clientWidth - tab.offsetWidth) / 2; // the chosen tab towards the middle
    el.scrollTo({ left: Math.max(0, want), behavior: bar ? 'smooth' : 'auto' });
    edgesOf();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { place(); edgesOf(); });
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'ds-mobile-menu' + (edges.left ? ' has-more-left' : '') + (edges.right ? ' has-more-right' : '')}>
      <div ref={scroller} className="ds-mobile-menu-scroll" role="tablist" aria-label={label} onScroll={edgesOf}>
        {items.map((it) => (
          <button key={it.value} type="button" role="tab" className="ds-mobile-menu-item" aria-selected={it.value === value} onClick={() => onChange(it.value)}>{it.label}</button>
        ))}
        {bar && <span className="ds-mobile-menu-bar" aria-hidden="true" style={{ width: bar.width, transform: `translateX(${bar.left}px)` }} />}
      </div>
    </div>
  );
}

/** pager (Thread 64:800): a dot per page, the current one long; past what fits ("Max", up to 408px) a window of dots
 *  follows the current page and the dot at a cut edge fades (src/ui/pager.js). onPick(page). */
export function Pager({ count, current, onPick, label = 'Choose a page', itemLabel = (i) => `Page ${i + 1} of ${count}` }) {
  const [fit, setFit] = useState(() => dotsThatFit(408));
  useEffect(() => {
    const measure = () => setFit(dotsThatFit(window.innerWidth - 48)); // the phone's width less its 24px sides
    measure(); window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  if (count < 2) return null;
  return (
    <div className="ds-pager" role="group" aria-label={label}>
      {pagerDots(count, current, fit).map((d) => (
        <button key={d.page} type="button" className={'ds-pager-dot' + (d.faded ? ' is-faded' : '')} aria-current={d.current} aria-label={itemLabel(d.page)} onClick={() => onPick(d.page)} />
      ))}
    </div>
  );
}

const ONE_LINE = 40; // characters of a 14px message that fit beside an action in a 358px toast
const TOAST_ICON = { default: 'check', negative: 'alert-triangle', warning: 'alert-circle' };
/** toast (Thread 140:144): { type: default | negative | warning, message, icon (null: none; default by type), action +
 *  onAction (Negative and Warning: on the right), extra: [{ label, onClick }] (Default: a row of buttons under it). */
export function ToastView({ toast }) {
  const type = toast.type || 'default';
  const icon = toast.icon === null ? null : toast.icon || TOAST_ICON[type];
  const extra = toast.extra?.length ? toast.extra : null;
  return (
    <div className={'ds-toast' + (type !== 'default' ? ` is-${type}` : '')} role={type === 'negative' ? 'alert' : 'status'}>
      {icon && <span className="ds-toast-lead"><Icon name={icon} size={16} className="ds-toast-icon" /></span>}
      <div className="ds-toast-content">
        {/* A message longer than one line takes the full width and its action goes under it (Figma 429:5170). */}
        <div className={'ds-toast-main' + (String(toast.message || '').length > ONE_LINE ? ' is-stacked' : '')}>
          <span className="ds-toast-message">{toast.message}</span>
          {toast.action && <button type="button" className="ds-toast-action" onClick={toast.onAction}>{toast.action}</button>}
        </div>
        {extra && (
          <div className="ds-toast-extra" role="group" aria-label={toast.extraLabel || 'More actions'}>
            {extra.map((x) => <button key={x.label} type="button" className="ds-toast-action" onClick={x.onClick}>{x.label}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}
