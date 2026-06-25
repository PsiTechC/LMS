"use client";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

export default function StatCard({ label, value, sub, color = "#1C2551" }: StatCardProps) {
  return (
    <div style={s.card}>
      <div style={{ fontSize: 11, color: "#8b90a7", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  card: {
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #EAECF4",
    boxShadow: "0 1px 4px rgba(28,37,81,0.07)",
    padding: 20,
    flex: 1,
  },
};
