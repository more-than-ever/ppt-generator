import React from "react";

export default function SceneCanvas({
  scene,
  assets = {},
  label = "页面预览",
  onFieldSelect,
}) {
  if (!scene) return null;
  return (
    <svg
      viewBox="0 0 1600 900"
      role="img"
      aria-label={label}
      className="scene-canvas"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        background: scene.background,
      }}
    >
      {scene.elements.map((e, i) => {
        if (e.kind === "rect")
          return (
            <rect
              key={i}
              x={e.x}
              y={e.y}
              width={e.w}
              height={e.h}
              rx={e.radius || 0}
              fill={e.fill || "none"}
              stroke={e.stroke || "none"}
              strokeWidth={1}
            />
          );
        if (e.kind === "line")
          return (
            <line
              key={i}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke={e.stroke}
              strokeWidth={e.width}
            />
          );
        if (e.kind === "image")
          return (
            <image
              key={i}
              x={e.x}
              y={e.y}
              width={e.w}
              height={e.h}
              href={assets[e.assetId]?.dataUrl || assets[e.assetId]?.url}
              preserveAspectRatio={
                e.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"
              }
            />
          );
        if (e.kind === "text")
          return (
            <text
              key={i}
              fill={e.color}
              fontFamily={e.font}
              fontSize={e.fontSize}
              fontWeight={e.bold ? 700 : 400}
              xmlSpace="preserve"
              onClick={() => onFieldSelect?.(e.field)}
              style={{ cursor: onFieldSelect ? "text" : "default" }}
            >
              {e.lines.map((line, n) => (
                <tspan key={n} x={e.x} y={e.y + (e.baseline ?? e.fontSize) + n * e.lineHeight}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        return null;
      })}
    </svg>
  );
}
