export function CupolaMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3.5 19.5h17" />
      <path d="M6.5 19.5v-8a5.5 5.5 0 0 1 11 0v8" />
      <path d="M10.2 19.5v-4.6M13.8 19.5v-4.6" />
      <path d="M12 3v2.2" />
    </svg>
  );
}
