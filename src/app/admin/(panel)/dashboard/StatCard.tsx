import type { LucideIcon } from "lucide-react";

export default function StatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  note,
  noteColor = "text-gray-500",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  note?: string;
  noteColor?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 flex items-start justify-between">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {label}
        </p>
        <p className="text-3xl font-bold text-[#1A1A1A] mt-2">{value}</p>
        {note && <p className={`text-xs mt-1 ${noteColor}`}>{note}</p>}
      </div>
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
    </div>
  );
}
