export function CopilotMark({
  className,
  size = 18,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M12 2.2 14.2 8l5.8.4-4.4 3.8 1.4 5.6L12 14.8 7 17.8l1.4-5.6L4 8.4 9.8 8 12 2.2Z"
        fill="currentColor"
      />
      <path
        d="M19.2 3.4 20 5.6l2.2.3-1.7 1.5.5 2.2-1.9-1.2-1.9 1.2.5-2.2-1.7-1.5 2.2-.3.8-2.2Z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}
