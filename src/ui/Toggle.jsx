'use client';
// Thread Design System "Toggle" (vertical, 20×32), drawn with tokens: off = outlined track, knob at the bottom;
// on = filled track, light knob at the top.
export function Toggle({ label, checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="ds-toggle" onClick={() => onChange(!checked)}>
      {label && <span className="ds-toggle-label">{label}</span>}
      <span className="ds-toggle-track" aria-hidden="true"><span className="ds-toggle-knob" /></span>
    </button>
  );
}
