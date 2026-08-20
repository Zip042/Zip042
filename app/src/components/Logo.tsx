export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="2" y="2" width="96" height="96" rx="24" fill="#0F6B4A" />
      <polygon points="50,16 82,44 18,44" fill="#F5B942" />
      <rect x="26" y="38" width="48" height="46" rx="10" fill="#FFFFFF" />
      <rect x="33" y="48" width="12" height="12" rx="3" fill="#0F6B4A" />
      <rect x="55" y="48" width="12" height="12" rx="3" fill="#0F6B4A" />
      <path
        d="M40 66 L47 73 L61 58"
        fill="none"
        stroke="#0F6B4A"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="20" y="78" width="60" height="16" rx="5" fill="#F5B942" />
      <text
        x="50"
        y="90"
        textAnchor="middle"
        fontFamily="Nunito, sans-serif"
        fontWeight="900"
        fontSize="13"
        fill="#0F6B4A"
      >
        042
      </text>
    </svg>
  );
}
