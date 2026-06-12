interface BscLogoMarkProps {
  size?: number;
  className?: string;
}

export function BscLogoMark({ size = 32, className }: BscLogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 110"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Banco Santa Cruz"
    >
      {/* Green top-right accent triangle */}
      <path d="M63,3 L80,19 L70,11 Z" fill="#48A157" />

      {/* Blue upper half of globe */}
      <path
        d="M50,16 C26,16 9,32 8,54 L8,60 L92,60 L92,54 C91,32 74,16 50,16 Z"
        fill="#104B99"
      />

      {/* White divider */}
      <rect x="6" y="57" width="88" height="9" fill="white" />

      {/* Green lower half of globe */}
      <path
        d="M8,66 L92,66 C90,88 72,104 50,104 C28,104 10,88 8,66 Z"
        fill="#48A157"
      />

      {/* Blue bottom-right accent */}
      <path d="M80,80 L96,100 L87,92 Z" fill="#104B99" />
    </svg>
  );
}
