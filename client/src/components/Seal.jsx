export default function Seal({ label = 'Verified' }) {
  return (
    <span className="seal">
      <svg viewBox="0 0 16 16" fill="none">
        <path d="M8 1L9.8 4.6L13.8 5.2L11 8L11.7 12L8 10.2L4.3 12L5 8L2.2 5.2L6.2 4.6L8 1Z"
          fill="currentColor" />
      </svg>
      {label}
    </span>
  );
}
