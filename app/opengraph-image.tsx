// app/opengraph-image.tsx
import { ImageResponse } from "next/og";
import { person } from "@/resources/content";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = person.name;

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "linear-gradient(135deg, #1A1D24 0%, #0a0c10 100%)",
        color: "#fff",
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 800 }}>{person.name}</div>
      <div
        style={{ fontSize: 30, marginTop: 24, color: "#A0A0A0", maxWidth: 900 }}
      >
        {person.role}
      </div>
    </div>,
    { ...size },
  );
}
