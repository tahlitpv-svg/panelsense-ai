import React from 'react';

export default function EditorSolarPanel({ width, height, color, isSelected, stringId, panelIndex, scale, watts }) {
  const isLandscape = width > height;
  const cols = isLandscape ? 6 : 4;
  const rows = isLandscape ? 4 : 6;
  const colW = (100 / cols).toFixed(2);
  const rowH = (100 / rows).toFixed(2);
  const scaledW = width * scale;
  const scaledH = height * scale;
  const showLabel = scaledW > 28 && scaledH > 22;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: `
          linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px),
          linear-gradient(155deg, #17355f 0%, #0c2147 40%, #071428 100%)
        `,
        backgroundSize: `${colW}% ${rowH}%, ${colW}% ${rowH}%, 100% 100%`,
        border: isSelected ? '2px solid #2563eb' : `2px solid ${color}`,
        boxShadow: isSelected
          ? '0 0 0 2px rgba(37,99,235,0.18), 0 0 18px rgba(37,99,235,0.22), inset 0 0 0 1px rgba(200,220,255,0.15)'
          : 'inset 0 0 0 1px rgba(200,220,255,0.08), 0 2px 6px rgba(0,0,0,0.35)',
        overflow: 'hidden',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 2,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '28%', background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: Math.max(3, Math.round(5 * scale)), backgroundColor: color, opacity: 0.92 }} />

      {showLabel && (
        <>
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: Math.max(8, Math.round(10 * scale)), fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.9)', zIndex: 1 }}>
            {watts > 0 ? watts : stringId}
          </span>
          {scaledH > 34 && (
            <span style={{ color: 'rgba(200,220,255,0.5)', fontSize: Math.max(6, Math.round(8 * scale)), textShadow: '0 1px 2px rgba(0,0,0,0.9)', zIndex: 1, marginTop: 1 }}>
              {watts > 0 ? 'W' : `#${panelIndex}`}
            </span>
          )}
        </>
      )}
    </div>
  );
}