export function ErrorIllustration({ code }: { code: string }) {
  const is404 = code === "404";
  const color = is404 ? "#4F46E5" : "#EF4444";

  return (
    <svg
      width="160"
      height="160"
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="80" cy="80" r="72" fill={color} fillOpacity="0.08" />
      <circle cx="80" cy="80" r="56" fill={color} fillOpacity="0.12" />
      <path
        d="M80 40C57.9 40 40 57.9 40 80s17.9 40 40 40 40-17.9 40-40-17.9-40-40-40z"
        fill={color}
        fillOpacity="0.2"
      />
      <text
        x="80"
        y="92"
        textAnchor="middle"
        fontSize="48"
        fontWeight="600"
        fill={color}
        fontFamily="var(--font-sans)"
      >
        {is404 ? "404" : "500"}
      </text>
    </svg>
  );
}
