export default function Toggle({ grid, toggle }: { grid: boolean; toggle: () => void }) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: 36,
        height: 20,
        cursor: 'pointer',
         verticalAlign: 'bottom'
      }}
    >
      <input
        type="checkbox"
        checked={grid}
        onChange={toggle}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 10,
          background: grid ? '#4ade80' : '#94a3b8',
          transition: 'background .2s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,.2)',
            transition: 'transform .2s ease',
            transform: grid ? 'translateX(16px)' : 'translateX(0)',
          }}
        />
      </span>
    </label>
  );
}